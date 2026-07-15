"use client";

/**
 * VAD / noise-suppression notes (read before wiring this in):
 *
 * 1) "Real WebRTC VAD" (the algorithm inside libwebrtc) is actually a small
 *    statistical/GMM energy classifier, not a neural net — it's lighter than
 *    what most people assume. What Google Meet-style products lean on for
 *    accurate speech-vs-noise separation is closer to a small neural VAD.
 *    The honest, genuinely local-ML equivalent you can run in a browser is
 *    Silero VAD (an ONNX model) via onnxruntime-web, wrapped nicely by the
 *    @ricky0123/vad-web package. That's what's used below — it replaces the
 *    amplitude-threshold "checkSilence" loop with real per-frame speech
 *    probability inference from a trained model running locally in the tab.
 *
 * 2) "Remove background noise" — a full noise-suppression neural net (e.g.
 *    RNNoise-wasm) is a much bigger, riskier addition to bolt on untested.
 *    Instead this uses the browser's native noiseSuppression /
 *    echoCancellation / autoGainControl constraints on getUserMedia, which
 *    is real DSP/ML-backed noise suppression built into Chrome/Edge and is
 *    what most production web meeting apps rely on at the mic-capture stage.
 *
 * Install before using:
 *   npm install @ricky0123/vad-web onnxruntime-web
 *
 * By default @ricky0123/vad-web loads its ONNX model + worklet files from
 * jsDelivr's CDN at runtime, so no bundler config is required to get going.
 * If you later want to self-host those assets (e.g. offline / stricter CSP),
 * see: https://docs.vad.ricky0123.com/user-guide/browser/
 *
 * 3) Screen-recording proctoring — important limitation to know about:
 *    getDisplayMedia() cannot force a user to share their entire screen.
 *    The browser always shows a picker letting them choose "Entire Screen",
 *    a specific window, or a browser tab — that choice can't be removed by
 *    an app. What CAN be done, and what's implemented below: after they
 *    pick something, check track.getSettings().displaySurface. If it isn't
 *    "monitor" (i.e. they shared a single window/tab instead of the whole
 *    screen), that's treated as a proctoring violation, same as declining
 *    to share at all — because sharing just one app still lets someone
 *    alt-tab to something else undetected.
 */

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Square, Activity, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { apiClient } from "@/app/lib/api";
import { MicVAD } from "@ricky0123/vad-web";

interface Question {
  id: number;
  stage: string;
  category: string;
  difficulty: string;
  question_text: string;
  expected_keywords: string[];
}

// Fixed the Next.js 15 Params Promise typing
interface PageProps {
  params: Promise<{ session_id: string }>;
}

export default function CoreInterviewLoop({ params }: PageProps) {
  const router = useRouter();

  // Unwraps the asynchronous params correctly in modern Next.js
  const unwrappedParams = use(params);
  const sessionId = unwrappedParams.session_id;

  // --- State ---
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [showStrikeModal, setShowStrikeModal] = useState(false);
  const [strikeReason, setStrikeReason] = useState<"focus" | "screen">("focus");
  const [isRecording, setIsRecording] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);
  const [currentQuestionText, setCurrentQuestionText] = useState("");
  const [micVolume, setMicVolume] = useState(0);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const absenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- VAD Refs ---
  // Real local ML VAD (Silero, via onnxruntime-web) instead of a raw AnalyserNode.
  const vadInstanceRef = useRef<MicVAD | null>(null);
  const audioOnlyStreamRef = useRef<MediaStream | null>(null);
  const silenceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpokeTimeRef = useRef<number>(Date.now());

  // --- Screen-recording proctoring refs ---
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<BlobPart[]>([]);
  // Whatever should happen once screen sharing is (re)granted — starting the
  // first question, or resuming a paused recording after a mid-interview loss.
  const pendingScreenShareActionRef = useRef<(() => void) | null>(null);
  const [awaitingScreenShare, setAwaitingScreenShare] = useState(false);

  // --- 1. Initialization ---
  useEffect(() => {
    const blueprintStr = sessionStorage.getItem("interviewBlueprint");
    if (!blueprintStr) {
      toast.error("Unauthorized access. Please initialize a session first.");
      router.replace("/interview");
      return;
    }

    try {
      const parsed = JSON.parse(blueprintStr);
      setQuestions(parsed);
      setCurrentQuestionText(parsed[0].question_text);
      startCameraAndInterview(parsed[0].question_text);
    } catch (e) {
      router.replace("/interview");
    }

    return () => cleanupAudio();
  }, [router]);

  const startCameraAndInterview = async (firstQuestion: string) => {
    try {
      // Ask for noise-suppressed / echo-cancelled audio up front. This is
      // real browser-level DSP/ML noise handling (not a UI placebo) and is
      // the practical fix for "user is in a noisy room".
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;

      // Set up the real (Silero ONNX) VAD once, reusing the same mic track
      // for the whole session so we don't reload the ML model per question.
      await initVAD(stream);

      // The interview must NOT start until the entire screen is being
      // shared. If it's denied, limited to a window/tab, or fails for any
      // reason, we add a strike and hold here — speakQuestion only runs
      // once requestScreenShare() actually succeeds.
      const screenShared = await requestScreenShare();
      if (screenShared) {
        speakQuestion(firstQuestion);
      } else {
        setAwaitingScreenShare(true);
        pendingScreenShareActionRef.current = () => speakQuestion(firstQuestion);
      }
    } catch (err) {
      toast.error("Hardware access lost. You must allow camera/mic.");
    }
  };

  // --- Screen-recording proctoring ---
  // Returns true only if the ENTIRE screen is now actively being shared.
  const requestScreenShare = async (): Promise<boolean> => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        // This is only a hint to the browser's picker UI — it cannot force
        // the user to actually choose "Entire Screen" over a window/tab.
        video: { displaySurface: "monitor" } as MediaTrackConstraints,
        audio: false,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      const settings = screenTrack.getSettings() as MediaTrackSettings & { displaySurface?: string };

      if (settings.displaySurface && settings.displaySurface !== "monitor") {
        // They shared a single window/tab instead of the whole screen —
        // that doesn't give us real cheating visibility, so treat it the
        // same as refusing to share at all.
        screenStream.getTracks().forEach(t => t.stop());
        toast.error("Please share your ENTIRE SCREEN, not a single window or tab.");
        addStrike("screen");
        return false;
      }

      screenStreamRef.current = screenStream;
      setAwaitingScreenShare(false);

      // Fires if the user clicks the browser's native "Stop sharing" button,
      // or closes the window/tab they were sharing.
      screenTrack.onended = () => {
        screenStreamRef.current = null;
        setAwaitingScreenShare(true);
        toast.error("Screen sharing was stopped. The interview is paused until you share again.");

        // Freeze the interview exactly where it is — pause any in-progress
        // recording — and only resume once sharing is granted again.
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.pause();
        }
        const wasRecordingPaused = mediaRecorderRef.current?.state === "paused";
        pendingScreenShareActionRef.current = () => {
          if (wasRecordingPaused && mediaRecorderRef.current?.state === "paused") {
            mediaRecorderRef.current.resume();
          }
        };

        addStrike("screen");
      };

      startScreenRecording(screenStream);
      return true;
    } catch (err) {
      // User denied the screen-share permission prompt entirely.
      toast.error("Screen recording is required for this interview.");
      setAwaitingScreenShare(true);
      addStrike("screen");
      return false;
    }
  };

  const startScreenRecording = (stream: MediaStream) => {
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    screenChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) screenChunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const screenBlob = new Blob(screenChunksRef.current, { type: mimeType });

      // =====================================================================
      // ⬇️ FOR TESTING ONLY ⬇️
      console.log("Screen recording captured:", screenBlob.size, "bytes");
      // ⬆️ END TESTING BLOCK ⬆️
      // =====================================================================

      // =====================================================================
      // ⬇️ REAL PRODUCTION BACKEND LOGIC ⬇️
      // Uncomment when you want to upload the full screen recording for
      // review alongside the session's audio answers.
      /*
      const formData = new FormData();
      formData.append("session_id", sessionId || "test-session");
      formData.append("screen_recording", screenBlob, `${sessionId}_screen.webm`);
      apiClient.post("/api/v1/proctoring/screen-recording", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      }).catch((err) => console.error("Failed to upload screen recording:", err));
      */
      // ⬆️ END PRODUCTION BLOCK ⬆️
      // =====================================================================
    };

    // Collect in 5s chunks rather than one giant blob at the very end.
    recorder.start(5000);
    screenRecorderRef.current = recorder;
  };

  const stopScreenRecording = () => {
    if (screenRecorderRef.current && screenRecorderRef.current.state !== "inactive") {
      screenRecorderRef.current.stop();
    }
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
  };

  // Shared strike logic for both focus-loss and screen-share violations.
  const addStrike = (reason: "focus" | "screen") => {
    setStrikeReason(reason);
    setStrikes(prev => {
      const newStrikes = prev + 1;
      if (newStrikes >= 3) {
        terminateSession();
        return newStrikes;
      }
      setShowStrikeModal(true);
      return newStrikes;
    });
  };

  const initVAD = async (fullStream: MediaStream) => {
    const audioTracks = fullStream.getAudioTracks();
    if (audioTracks.length === 0) {
      toast.error("No microphone detected!");
      return;
    }
    const audioOnlyStream = new MediaStream(audioTracks);
    audioOnlyStreamRef.current = audioOnlyStream;

    try {
      const vad = await MicVAD.new({
        // Reuse our already-permissioned, noise-suppressed mic stream
        // instead of letting the library open a second getUserMedia stream.
        getStream: async () => audioOnlyStream,

        // Fires on every ~32ms audio frame with a 0..1 speech probability
        // from the Silero model. Drives the mic-level UI and, more
        // importantly, tells us in real time whether the user is actually
        // talking vs. room noise/static.
        onFrameProcessed: (probabilities) => {
          setMicVolume(Math.round(probabilities.isSpeech * 100));
        },
        onSpeechStart: () => {
          lastSpokeTimeRef.current = Date.now();
        },
        onSpeechEnd: () => {
          lastSpokeTimeRef.current = Date.now();
        },
        onVADMisfire: () => {
          // Model briefly thought speech started but it was a false alarm
          // (e.g. a cough or noise burst) — nothing to do, just don't treat
          // it as the user answering.
        },
      });

      vadInstanceRef.current = vad;
      // Keep it loaded but idle until we actually start a recording turn.
      vad.pause();
    } catch (err) {
      console.error("Failed to initialize VAD model:", err);
      toast.error("Voice detection failed to load. Falling back to manual submit only.");
    }
  };

  const cleanupAudio = () => {
    if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
    if (vadInstanceRef.current) {
      try {
        vadInstanceRef.current.destroy();
      } catch (e) {
        // no-op — instance may already be torn down
      }
      vadInstanceRef.current = null;
    }
    stopScreenRecording();
    window.speechSynthesis.cancel();
  };

  // --- 2. AI Speech & Auto-Record Trigger ---
  const speakQuestion = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang === "en-US" && (v.name.includes("Google") || v.name.includes("Microsoft"))) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.rate = 0.95;
    utterance.onstart = () => {
      setAiSpeaking(true);
      setIsRecording(false);
      // Make sure we're not evaluating "speech" while the AI's own TTS is
      // playing (echoCancellation handles most bleed-through, this is belt
      // and suspenders).
      vadInstanceRef.current?.pause();
    };

    utterance.onend = () => {
      setAiSpeaking(false);
      startRecording();
    };

    window.speechSynthesis.speak(utterance);
  };

  // --- 3. Recording & Voice Activity Detection (VAD) ---
  const startRecording = () => {
    const audioOnlyStream = audioOnlyStreamRef.current;
    if (!audioOnlyStream) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

    const mediaRecorder = new MediaRecorder(audioOnlyStream, { mimeType });
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      stopVADMonitoring();
      setIsRecording(false);
      setMicVolume(0);
      await processAudioChunk(mimeType);
    };

    mediaRecorder.start();
    setIsRecording(true);

    startVADMonitoring();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  // Turns the real ML VAD "on" for this recording turn and starts a
  // lightweight timer that watches how long it's been since the model last
  // detected genuine speech (as opposed to noise, which it should now
  // correctly ignore rather than tripping a raw volume threshold).
  const startVADMonitoring = () => {
    if (!vadInstanceRef.current) return;

    // Grace period before we start counting silence, same intent as before.
    lastSpokeTimeRef.current = Date.now() + 2000;
    vadInstanceRef.current.start();

    if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
    silenceCheckIntervalRef.current = setInterval(() => {
      if (mediaRecorderRef.current?.state !== "recording") return;
      const silenceDuration = Date.now() - lastSpokeTimeRef.current;
      if (silenceDuration > 6000) {
        stopRecording();
      }
    }, 250);
  };

  const stopVADMonitoring = () => {
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    vadInstanceRef.current?.pause();
  };

  // --- 4. Proctoring ---
  useEffect(() => {
    const handleBlur = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.pause();
      }
      addStrike("focus");
      absenceTimerRef.current = setInterval(() => {
        setStrikes(prev => {
          const newStrikes = prev + 1;
          if (newStrikes >= 3) terminateSession();
          return newStrikes;
        });
      }, 5000);
    };

    const handleFocus = () => {
      if (absenceTimerRef.current) clearInterval(absenceTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
        mediaRecorderRef.current.resume();
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const terminateSession = () => {
    toast.error("SESSION TERMINATED: Maximum proctoring violations reached.");
    stopScreenRecording();
    router.replace(`/interview/${sessionId}/results`);
  };

  // --- 5. Backend Submission ---
  const processAudioChunk = async (mimeType: string) => {
    if (audioChunksRef.current.length === 0) return;
    setIsProcessingChunk(true);

    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
    const currentQ = questions[currentIndex];
    const fileExtension = mimeType.includes("mp4") ? "m4a" : "webm";

    // =====================================================================
    // ⬇️ FOR TESTING ONLY (NO API CREDITS BURNED) ⬇️
    // Comment this entire block out when connecting to the real backend.

    await new Promise(resolve => setTimeout(resolve, 1500));
    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setCurrentQuestionText(questions[nextIndex].question_text);
      speakQuestion(questions[nextIndex].question_text);
    } else {
      stopScreenRecording();
      router.push(`/interview/${sessionId}/results`);
    }
    setIsProcessingChunk(false);
    return;

    // ⬆️ END TESTING BLOCK ⬆️
    // =====================================================================


    // =====================================================================
    // ⬇️ REAL PRODUCTION BACKEND LOGIC ⬇️
    // Uncomment this block when you want to hit your real FastAPI Server.

    /*
    const formData = new FormData();
    formData.append("session_id", sessionId || "test-session");
    formData.append("question_id", currentQ.id.toString());
    formData.append("audio_blob", audioBlob, `${sessionId}_q${currentQ.id}.${fileExtension}`);

    try {
      const response = await apiClient.post("/api/v1/audio/process-chunk", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      if (response.data.status === "clarification_required") {
        toast.info("Clarifying question...");
        setCurrentQuestionText(response.data.simplified_question);
        speakQuestion(response.data.simplified_question);
      } else {
        if (currentIndex < questions.length - 1) {
          const nextIndex = currentIndex + 1;
          setCurrentIndex(nextIndex);
          setCurrentQuestionText(questions[nextIndex].question_text);
          speakQuestion(questions[nextIndex].question_text);
        } else {
          router.push(`/interview/${sessionId}/results`);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to process answer. Moving to next question...");
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(prev => prev + 1);
        speakQuestion(questions[currentIndex + 1].question_text);
      } else {
        router.push(`/interview/${sessionId}/results`);
      }
    } finally {
      setIsProcessingChunk(false);
    }
    */
    // ⬆️ END PRODUCTION BLOCK ⬆️
    // =====================================================================
  };

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-[var(--accent-color)]" size={48} /></div>;

  const visualizerScale = isRecording ? 1 + (micVolume / 100) : 1;

  return (
    <div className="relative flex flex-col lg:flex-row h-[calc(100vh-80px)] bg-[var(--bg-color)] overflow-hidden">

      {showStrikeModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 px-4">
          <div className="bg-[var(--surface-card-color)] border-2 border-[var(--accent-color)] p-6 md:p-8 rounded-xl max-w-lg w-full text-center shadow-2xl">
            <ShieldAlert className="text-[var(--accent-color)] mx-auto mb-4" size={64} />
            <h2 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] mb-2 uppercase">
              {strikeReason === "screen" ? "Screen Recording Required" : "Focus Lost"}
            </h2>
            <p className="text-[var(--text-secondary)] mb-6 text-sm md:text-base">
              {strikeReason === "screen"
                ? "This interview requires your entire screen to be shared for the full duration. Sharing was declined, stopped, or limited to a single window/tab."
                : "The system detected you left the interview window. This is a strict violation of the proctoring rules."}
              <br /><br />
              <strong className="text-[var(--accent-color)] text-xl">Strike {strikes} of 3</strong>
            </p>
            {strikeReason === "screen" ? (
              <button
                onClick={async () => {
                  setShowStrikeModal(false);
                  const shared = await requestScreenShare();
                  if (shared && pendingScreenShareActionRef.current) {
                    pendingScreenShareActionRef.current();
                    pendingScreenShareActionRef.current = null;
                  }
                }}
                className="w-full py-4 bg-[var(--accent-color)] text-[var(--text-inverse)] font-black uppercase tracking-widest rounded-lg hover:opacity-90"
              >
                Share Entire Screen to Continue
              </button>
            ) : (
              <button
                onClick={() => setShowStrikeModal(false)}
                className="w-full py-4 bg-[var(--accent-color)] text-[var(--text-inverse)] font-black uppercase tracking-widest rounded-lg hover:opacity-90"
              >
                I Understand, Return to Interview
              </button>
            )}
          </div>
        </div>
      )}

      <div className="w-full lg:w-1/4 xl:w-1/5 bg-[var(--surface-color)] border-b lg:border-b-0 lg:border-r border-[var(--border-color)]/30 flex flex-col p-4">
        <div className="relative aspect-video lg:aspect-auto lg:flex-1 bg-black rounded-lg overflow-hidden border border-[var(--border-color)]/50">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
          <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} /> {isRecording ? 'Recording' : 'Standby'}
          </div>
        </div>
        <div className="mt-4 hidden lg:block text-xs text-[var(--text-secondary)] font-bold tracking-widest uppercase">
          Session: {sessionId?.substring(0,8) || "..."}
        </div>
      </div>

      <div className="flex-1 flex flex-col p-4 md:p-8">
        <div className="flex justify-between items-center mb-6">
          <span className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-widest">Question {currentIndex + 1} of {questions.length}</span>
          <span className="text-xs font-bold px-2 py-1 bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded text-[var(--accent-color)]">
            {currentQuestion.category}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto mb-6 bg-[var(--surface-card-color)] p-6 rounded-xl border border-[var(--border-color)] shadow-inner flex items-center justify-center text-center">
          <h2 className="text-xl md:text-3xl font-black text-[var(--text-primary)] leading-relaxed">
            {currentQuestionText}
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={stopRecording}
            disabled={aiSpeaking || isProcessingChunk || !isRecording || awaitingScreenShare}
            className={`flex-1 py-4 flex items-center justify-center gap-2 font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${!aiSpeaking && isRecording ? 'bg-red-500/10 text-red-500 border border-red-500 hover:bg-red-500/20' : 'bg-[var(--surface-card-color)] text-[var(--text-secondary)] border border-[var(--border-color)]'}`}
          >
            {isProcessingChunk ? (
              <><Loader2 className="animate-spin" size={18} /> Processing...</>
            ) : aiSpeaking ? (
              <><Loader2 className="animate-spin" size={18} /> AI Speaking...</>
            ) : (
              <><Square size={18} fill="currentColor" /> Submit Answer Early</>
            )}
          </button>
        </div>
      </div>

      <div className="w-full lg:w-1/4 xl:w-1/5 bg-[var(--surface-card-color)] border-t lg:border-t-0 lg:border-l border-[var(--border-color)]/30 flex flex-col items-center justify-center p-8 py-12 lg:py-8">
        <div className="relative w-32 h-32 md:w-48 md:h-48 flex items-center justify-center">
          <div
            className={`absolute inset-0 border-2 border-[var(--accent-color)] rounded-full transition-all duration-100 ${aiSpeaking ? 'scale-110 opacity-50 animate-ping' : 'opacity-20'}`}
            style={isRecording ? { transform: `scale(${visualizerScale})`, opacity: 0.5 } : {}}
          />
          <div className="absolute inset-4 bg-[var(--accent-color)] rounded-full shadow-[0_0_30px_var(--accent-color)] flex items-center justify-center">
            <Activity className="text-[var(--bg-color)]" size={32} />
          </div>
        </div>
        <p className="mt-8 text-sm font-bold text-[var(--text-secondary)] uppercase tracking-widest text-center">
          {awaitingScreenShare ? "Waiting for Screen Share..." : aiSpeaking ? "AI is Speaking..." : isRecording ? "Listening to you..." : "Processing..."}
        </p>
      </div>

    </div>
  );
}