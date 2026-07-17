"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShieldAlert, Square, Activity, Loader2, XCircle } from "lucide-react";
import { toast } from "react-toastify";
import { MicVAD } from "@ricky0123/vad-web";

interface Question {
  id: number;
  stage: string;
  category: string;
  difficulty: string;
  question_text: string;
  expected_keywords: string[];
}

export default function CoreInterviewLoop() {
  const router = useRouter();
  const params = useParams();
  
  const sessionId = (params?.["session-id"] || params?.["session_id"] || params?.session_id) as string;

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
  
  const [screenCountdown, setScreenCountdown] = useState<number | null>(null);

  // --- Refs to manage stale closures and async cycles ---
  const questionsRef = useRef<Question[]>([]);
  const currentIndexRef = useRef(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const absenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Streaming Refs ---
  const socketRef = useRef<WebSocket | null>(null);

  // --- VAD Refs ---
  const vadInstanceRef = useRef<MicVAD | null>(null);
  const audioOnlyStreamRef = useRef<MediaStream | null>(null);
  const silenceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpokeTimeRef = useRef<number>(Date.now());

  // --- Proctoring Refs ---
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<BlobPart[]>([]);
  const pendingScreenShareActionRef = useRef<(() => void) | null>(null);
  const [awaitingScreenShare, setAwaitingScreenShare] = useState(false);

  const screenLossTimerRef = useRef<NodeJS.Timeout | null>(null);
  const screenCountdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;

      await initVAD(stream);

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

  const requestScreenShare = async (): Promise<boolean> => {
    try {
      let stream = (window as any).__screenStream;
      const isStreamActive = stream && stream.getVideoTracks()[0]?.readyState === "live";

      if (!isStreamActive) {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "monitor" } as MediaTrackConstraints,
          audio: false,
        });
      }

      const screenTrack = stream.getVideoTracks()[0];
      screenStreamRef.current = stream;
      (window as any).__screenStream = stream;
      setAwaitingScreenShare(false);
      
      setScreenCountdown(null);
      if (screenLossTimerRef.current) clearTimeout(screenLossTimerRef.current);
      if (screenCountdownIntervalRef.current) clearInterval(screenCountdownIntervalRef.current);

      screenTrack.onended = () => {
        screenStreamRef.current = null;
        (window as any).__screenStream = null;
        setAwaitingScreenShare(true);

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.pause();
        }
        if (socketRef.current) {
          socketRef.current.close();
        }
        window.speechSynthesis.pause();

        toast.warning("Screen sharing lost! You have 5 seconds to share again or you will receive a strike.");

        let secondsLeft = 5;
        setScreenCountdown(secondsLeft);

        screenCountdownIntervalRef.current = setInterval(() => {
          secondsLeft -= 1;
          setScreenCountdown(secondsLeft);
          if (secondsLeft <= 0 && screenCountdownIntervalRef.current) clearInterval(screenCountdownIntervalRef.current);
        }, 1000);

        screenLossTimerRef.current = setTimeout(() => {
          if (screenCountdownIntervalRef.current) clearInterval(screenCountdownIntervalRef.current);
          setScreenCountdown(null);
          addStrike("screen");
        }, 5000);
      };

      startScreenRecording(stream);
      return true;
    } catch (err) {
      toast.error("Screen recording is required for this interview.");
      setAwaitingScreenShare(true);
      addStrike("screen");
      return false;
    }
  };

  const startScreenRecording = (stream: MediaStream) => {
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    screenChunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
    recorder.start(5000);
    screenRecorderRef.current = recorder;
  };

  const stopScreenRecording = () => {
    if (screenRecorderRef.current && screenRecorderRef.current.state !== "inactive") screenRecorderRef.current.stop();
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    if (typeof window !== "undefined") (window as any).__screenStream = null;
  };

  const addStrike = (reason: "focus" | "screen") => {
    setStrikeReason(reason);
    setStrikes(prev => {
      const newStrikes = prev + 1;
      if (newStrikes >= 3) terminateSession();
      else setShowStrikeModal(true);
      return newStrikes;
    });
  };

  const initVAD = async (fullStream: MediaStream) => {
    const audioTracks = fullStream.getAudioTracks();
    if (audioTracks.length === 0) return toast.error("No microphone detected!");
    const audioOnlyStream = new MediaStream(audioTracks);
    audioOnlyStreamRef.current = audioOnlyStream;

    try {
      const vadOptions: any = {
        workletURL: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.7/dist/vad.worklet.bundle.min.js",
        modelURL: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.7/dist/silero_vad.onnx",
        getStream: async () => audioOnlyStream,
        onFrameProcessed: (probabilities: any) => {
          const isSpeechProb = probabilities.isSpeech;
          setMicVolume(Math.round(isSpeechProb * 100));
          if (isSpeechProb > 0.50) {
            lastSpokeTimeRef.current = Date.now();
          }
        },
      };
      const vad = await MicVAD.new(vadOptions);
      vadInstanceRef.current = vad;
      vad.pause();
    } catch (err) {
      console.error("Failed to initialize VAD model:", err);
    }
  };

  const cleanupAudio = () => {
    if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
    if (screenCountdownIntervalRef.current) clearInterval(screenCountdownIntervalRef.current);
    if (screenLossTimerRef.current) clearTimeout(screenLossTimerRef.current);
    if (vadInstanceRef.current) {
      try { vadInstanceRef.current.destroy(); } catch (e) {}
      vadInstanceRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    stopScreenRecording();
    window.speechSynthesis.cancel();
  };

  const speakQuestion = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    const loadVoicesAndSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const pVoice = voices.find(v => v.lang === "en-US" && (v.name.includes("Google") || v.name.includes("Microsoft"))) || voices[0];
        if (pVoice) utterance.voice = pVoice;
      }
      utterance.rate = 0.95;
      utterance.onstart = () => { setAiSpeaking(true); setIsRecording(false); vadInstanceRef.current?.pause(); };
      utterance.onend = () => { setAiSpeaking(false); startRecording(); };
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) window.speechSynthesis.onvoiceschanged = loadVoicesAndSpeak;
    else loadVoicesAndSpeak();
  };

  // --- WebSocket Streaming Initialization & Loop Execution ---
  const startRecording = () => {
    const audioOnlyStream = audioOnlyStreamRef.current;
    if (!audioOnlyStream) return;

    // Use absolute routing scheme relative to backend host definitions
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL|| "ws://127.0.0.1:8000"}/api/v1/audio/stream`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      const currentQ = questionsRef.current[currentIndexRef.current];
      // Send handshake initialization payload
      socket.send(JSON.stringify({
        type: "handshake",
        session_id: sessionId,
        question_id: currentQ.id
      }));

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(audioOnlyStream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          // Send raw binary chunks downstream instantly
          socket.send(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stopVADMonitoring();
        setIsRecording(false);
        setMicVolume(0);
        setIsProcessingChunk(true);
      };

      // Forces continuous slice generation every 250ms
      mediaRecorder.start(250);
      setIsRecording(true);
      startVADMonitoring();
    };

    socket.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        setIsProcessingChunk(false);

        if (response.status === "clarification_required" || response.status === "elaboration_required" || response.status === "explanation_required") {
          const dynamicText = response.simplified_question || response.explanation || response.text;
          toast.info("AI Intercepting Pipeline...");
          setCurrentQuestionText(dynamicText);
          socket.close(); // Clean old context socket
          speakQuestion(dynamicText);
        } else if (response.status === "success") {
          socket.close();
          const currentIdx = currentIndexRef.current;
          const currentQuestions = questionsRef.current;

          if (currentIdx < currentQuestions.length - 1) {
            const nextIndex = currentIdx + 1;
            setCurrentIndex(nextIndex);
            setCurrentQuestionText(currentQuestions[nextIndex].question_text);
            speakQuestion(currentQuestions[nextIndex].question_text);
          } else {
            stopScreenRecording();
            router.push(`/interview/${sessionId}/results`);
          }
        }
      } catch (err) {
        console.error("Failed to compile streamed frame layout:", err);
      }
    };

    socket.onerror = () => {
      toast.error("Streaming server connection error.");
    };

    socket.onclose = () => {
      setIsRecording(false);
    };
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      // Signal explicit turn ending to the server
      socketRef.current.send(JSON.stringify({ type: "END_OF_TURN" }));
    }
  };

  const startVADMonitoring = () => {
    if (!vadInstanceRef.current) return;
    lastSpokeTimeRef.current = Date.now();
    vadInstanceRef.current.start();

    if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
    silenceCheckIntervalRef.current = setInterval(() => {
      if (mediaRecorderRef.current?.state !== "recording") return;
      const silenceDuration = Date.now() - lastSpokeTimeRef.current;
      
      // Accelerated turn completion checking (2000ms threshold for real-time responsiveness)
      if (silenceDuration > 2000) {
        stopRecording();
      }
    }, 200);
  };

  const stopVADMonitoring = () => {
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    vadInstanceRef.current?.pause();
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.pause();
        addStrike("focus");
        absenceTimerRef.current = setInterval(() => {
          setStrikes(prev => {
            const newStrikes = prev + 1;
            if (newStrikes >= 3) terminateSession();
            return newStrikes;
          });
        }, 5000);
      } else {
        if (absenceTimerRef.current) clearInterval(absenceTimerRef.current);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") mediaRecorderRef.current.resume();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const terminateSession = () => {
    toast.error("SESSION TERMINATED: Maximum proctoring violations reached.");
    stopScreenRecording();
    router.replace(`/interview/${sessionId}/results`);
  };

  const handleEndCall = () => {
    cleanupAudio();
    router.push(`/interview/${sessionId}/results`);
  };

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-[var(--accent-color)]" size={48} /></div>;

  const visualizerScale = isRecording ? 1 + (micVolume / 100) : 1;

  return (
    <div className="relative flex flex-col lg:flex-row h-[calc(100vh-80px)] bg-[var(--bg-color)] overflow-hidden">
      {screenCountdown !== null && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 px-4">
          <div className="bg-[var(--surface-card-color)] border-2 border-yellow-500 p-6 md:p-8 rounded-xl max-w-lg w-full text-center shadow-2xl">
            <ShieldAlert className="text-yellow-500 mx-auto mb-4 animate-bounce" size={64} />
            <h2 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] mb-2 uppercase tracking-wide">Screen Share Interrupted</h2>
            <p className="text-[var(--text-secondary)] mb-6 text-sm md:text-base leading-relaxed">
              You disconnected the screen share. Restore full-screen sharing immediately to prevent a penalty strike.<br /><br />
              <strong className="text-red-500 text-4xl block font-mono">{screenCountdown}s</strong>
            </p>
            <button
              onClick={async () => {
                const shared = await requestScreenShare();
                if (shared && pendingScreenShareActionRef.current) {
                  pendingScreenShareActionRef.current();
                  pendingScreenShareActionRef.current = null;
                }
              }}
              className="w-full py-4 bg-yellow-500 hover:bg-yellow-600 text-black font-black uppercase tracking-widest rounded-lg transition-all"
            >
              Restore Entire Screen Sharing
            </button>
          </div>
        </div>
      )}

      {showStrikeModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 px-4">
          <div className="bg-[var(--surface-card-color)] border-2 border-[var(--accent-color)] p-6 md:p-8 rounded-xl max-w-lg w-full text-center shadow-2xl">
            <ShieldAlert className="text-[var(--accent-color)] mx-auto mb-4" size={64} />
            <h2 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] mb-2 uppercase">
              {strikeReason === "screen" ? "Screen Recording Strike" : "Focus Lost"}
            </h2>
            <p className="text-[var(--text-secondary)] mb-6 text-sm md:text-base">
              {strikeReason === "screen"
                ? "You failed to restore screen sharing within the 5-second grace window."
                : "The system detected you left the interview window."}
              <br /><br /><strong className="text-[var(--accent-color)] text-xl">Strike {strikes} of 3</strong>
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
              >Share Entire Screen to Resume</button>
            ) : (
              <button onClick={() => setShowStrikeModal(false)} className="w-full py-4 bg-[var(--accent-color)] text-[var(--text-inverse)] font-black uppercase tracking-widest rounded-lg hover:opacity-90">
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

        <div className="flex flex-col sm:flex-row gap-4 w-full">
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

          <button
            onClick={handleEndCall}
            disabled={isProcessingChunk}
            className="flex-1 py-4 flex items-center justify-center gap-2 font-black uppercase tracking-widest rounded-xl transition-all bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg disabled:opacity-50"
          >
            <XCircle size={18} /> End Call
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