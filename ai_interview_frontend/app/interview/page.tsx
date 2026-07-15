"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, Mic, Volume2, CheckCircle, Loader2, PlayCircle, ShieldAlert, RefreshCw, ScreenShare } from "lucide-react";
import { apiClient } from "../lib/api";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function PreFlightPage() {
  const router = useRouter();
  
  // --- Hardware State ---
  const [cameraTested, setCameraTested] = useState(false);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [micTested, setMicTested] = useState(false);
  const [screenTested, setScreenTested] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  
  // --- Recording State ---
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micAudioUrl, setMicAudioUrl] = useState<string | null>(null);
  const [isCheckingScreen, setIsCheckingScreen] = useState(false);
  
  // --- Initialization State ---
  const [isInitializing, setIsInitializing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // 1. Camera Logic
  const startCamera = async () => {
    setCameraTested(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraTested(true);
      }
    } catch (err) {
      toast.error("Camera access denied. Check your browser permissions.");
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // 2. Speaker Logic (Allows unlimited replays)
  const testSpeaker = () => {
    setSpeakerTested(false);
    const audio = new Audio('/speaker-test.wav'); 
    audio.play()
      .then(() => setSpeakerTested(true))
      .catch(() => toast.error("Failed to play test audio. Check your volume."));
  };

  // 3. Microphone Logic (Allows re-recording)
  const testMicrophone = async () => {
    try {
      setMicTested(false);
      
      // Cleanup previous recording if user is re-testing
      if (micAudioUrl) {
        URL.revokeObjectURL(micAudioUrl);
        setMicAudioUrl(null);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setMicAudioUrl(audioUrl);
        setMicTested(true);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingMic(true);

      // Record for exactly 5 seconds
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
          setIsRecordingMic(false);
        }
      }, 11000);

    } catch (err) {
      toast.error("Microphone access denied.");
    }
  };

  // 4. Screen-Share Logic (Dry run only — the interview page must request its
  // own getDisplayMedia stream since a stream can't survive a page
  // navigation. This step exists purely to surface permission/"which surface
  // did they pick" problems BEFORE the interview clock starts, instead of
  // the user hitting a denial strike on question one.)
  const testScreenShare = async () => {
    setIsCheckingScreen(true);
    setScreenTested(false);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // Hints the picker toward "Entire Screen" — browsers don't let an
        // app force this choice, so we still have to validate what came back.
        video: { displaySurface: "monitor" } as MediaTrackConstraints,
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string };

      if (settings.displaySurface && settings.displaySurface !== "monitor") {
        toast.error("Please choose 'Entire Screen', not a specific window or tab.");
        stream.getTracks().forEach(t => t.stop());
        setIsCheckingScreen(false);
        return;
      }

      if (screenPreviewRef.current) {
        screenPreviewRef.current.srcObject = stream;
      }
      setScreenTested(true);

      // We only needed this to confirm the browser will actually grant
      // whole-screen sharing. Stop the tracks shortly after — the interview
      // page will open its own stream when it starts.
      setTimeout(() => {
        stream.getTracks().forEach(t => t.stop());
        if (screenPreviewRef.current) screenPreviewRef.current.srcObject = null;
        setIsCheckingScreen(false);
      }, 11000);
    } catch (err) {
      toast.error("Screen sharing was denied or cancelled. This is required to start the interview.");
      setIsCheckingScreen(false);
    }
  };

  // 5. Initialize Backend Session
  const handleStartInterview = async () => {
    setIsInitializing(true);
    
    const savedResume = sessionStorage.getItem("extractedResume");
    const targetJobId = sessionStorage.getItem("interviewTargetJobId"); 
    
    if (!savedResume) {
      toast.error("Resume data missing. Please return to analysis.");
      router.push("/analysis");
      return;
    }

    try {
      const response = await apiClient.post("/api/v1/interview/initialize", {
        parsed_resume: JSON.parse(savedResume),
        job_description: "Target Role Context Placeholder" 
      });

      const sessionId = response.data.session_id;
      sessionStorage.setItem("interviewBlueprint", JSON.stringify(response.data.blueprint));
      router.push(`/interview/${sessionId}`);
      
    } catch (error) {
      console.error(error);
      toast.error("Failed to initialize interview engine. Server may be down.");
      setIsInitializing(false);
    }
  };

  const allTestsPassed = cameraTested && speakerTested && micTested && screenTested && consentGiven;

  return (
    <div className="max-w-[1000px] mx-auto px-4 py-8 min-h-[calc(100vh-80px)]">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black text-[var(--text-primary)]">System Diagnostics</h1>
        <p className="text-[var(--text-secondary)] mt-2">Complete the hardware checks to unlock the interview environment.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Camera Feed & Proctoring Rules */}
        <div className="space-y-6">
          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-4 overflow-hidden relative aspect-video flex items-center justify-center bg-black shadow-inner">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover rounded-lg transform scale-x-[-1]" 
            />
            {!cameraTested && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-[var(--text-inverse)]">
                <Loader2 className="animate-spin mr-2 text-[var(--accent-color)]" /> Requesting Camera Access...
              </div>
            )}
          </div>

          <div className="bg-[var(--bg-color)] border border-[var(--accent-color)]/30 rounded-xl p-6 shadow-md">
            <h3 className="text-[var(--accent-color)] font-black flex items-center gap-2 mb-3">
              <ShieldAlert size={20} /> Strict Proctoring Enforced
            </h3>
            <ul className="text-sm text-[var(--text-primary)] space-y-2 mb-4">
              <li>1. <strong>Do not switch tabs.</strong> Leaving the window triggers an automatic strike.</li>
              <li>2. <strong>Do not minimize the browser.</strong></li>
              <li>3. <strong>Share your entire screen</strong> for the full interview — sharing only a window/tab, or stopping the share, triggers a strike.</li>
              <li>4. Accumulating 3 strikes results in immediate session termination.</li>
              <li>5. Your screen and audio are recorded for final evaluation.</li>
            </ul>
            <label className="flex items-start gap-3 cursor-pointer p-3 bg-[var(--surface-card-color)] rounded border border-[var(--border-color)]">
              <input 
                type="checkbox" 
                className="mt-1 w-4 h-4 accent-[var(--accent-color)]"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
              />
              <span className="text-sm text-[var(--text-secondary)] font-bold">
                I understand the rules and consent to audio/video/screen recording.
              </span>
            </label>
          </div>
        </div>

        {/* Right Column: Hardware Stepper */}
        <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 shadow-lg flex flex-col">
          <h2 className="text-xl font-black mb-6 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Hardware Validation</h2>
          
          <div className="flex-1 space-y-6">
            
            {/* Step 1: Camera */}
            <div className={`flex items-center justify-between p-4 rounded-lg border ${cameraTested ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10' : 'border-[var(--border-color)] bg-[var(--bg-color)]'}`}>
              <div className="flex items-center gap-3">
                <Camera className={cameraTested ? "text-[var(--accent-color)]" : "text-[var(--text-secondary)]"} />
                <div>
                  <h4 className="font-bold text-[var(--accent-color)]">Video Feed</h4>
                  <p className="text-xs text-[var(--text-secondary)]">{cameraTested ? "Camera connected." : "Waiting for permission..."}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={startCamera} className="p-2 text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors" title="Retest Camera">
                  <RefreshCw size={16} />
                </button>
                {cameraTested && <CheckCircle className="text-[var(--accent-color)]" />}
              </div>
            </div>

            {/* Step 2: Speaker */}
            <div className={`flex items-center justify-between p-4 rounded-lg border ${speakerTested ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10' : 'border-[var(--border-color)] bg-[var(--bg-color)]'}`}>
              <div className="flex items-center gap-3">
                <Volume2 className={speakerTested ? "text-[var(--accent-color)]" : "text-[var(--text-secondary)]"} />
                <div>
                  <h4 className="font-bold text-[var(--accent-color)]">Speaker Output</h4>
                  <p className="text-xs text-[var(--text-secondary)]">Play the test sound to verify.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={testSpeaker} className="px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold rounded flex items-center gap-1 hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition-all">
                  <PlayCircle size={14} /> {speakerTested ? "Play Again" : "Play Sound"}
                </button>
                {speakerTested && <CheckCircle className="text-[var(--accent-color)]" />}
              </div>
            </div>

            {/* Step 3: Microphone */}
            <div className={`flex flex-col p-4 rounded-lg border ${micTested ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10' : 'border-[var(--border-color)] bg-[var(--bg-color)]'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mic className={micTested ? "text-[var(--accent-color)]" : "text-[var(--text-secondary)]"} />
                  <div>
                    <h4 className="font-bold text-[var(--accent-color)]">Microphone Input</h4>
                    <p className="text-xs text-[var(--text-secondary)]">Record a 10-second test clip.</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {isRecordingMic ? (
                    <span className="text-[var(--accent-color)] text-xs font-bold animate-pulse flex items-center gap-1">
                      <div className="w-2 h-2 bg-[var(--accent-color)] rounded-full"></div> Recording...
                    </span>
                  ) : (
                    <button onClick={testMicrophone} className="px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold rounded hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition-all">
                      {micTested ? "Retest Mic" : "Test Mic"}
                    </button>
                  )}
                  {micTested && !isRecordingMic && <CheckCircle className="text-[var(--accent-color)]" />}
                </div>
              </div>
              
              {/* Playback Audio */}
              {micAudioUrl && !isRecordingMic && (
                <div className="mt-4 pt-4 border-t border-[var(--border-color)]/30">
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Listen to your recording to ensure clarity:</p>
                  <audio controls src={micAudioUrl} className="h-8 w-full outline-none" />
                </div>
              )}
            </div>

            {/* Step 4: Screen Share */}
            <div className={`flex flex-col p-4 rounded-lg border ${screenTested ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10' : 'border-[var(--border-color)] bg-[var(--bg-color)]'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ScreenShare className={screenTested ? "text-[var(--accent-color)]" : "text-[var(--text-secondary)]"} />
                  <div>
                    <h4 className="font-bold text-[var(--accent-color)]">Screen Recording</h4>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {screenTested ? "Entire-screen sharing confirmed." : "Confirm you can share your ENTIRE screen."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={testScreenShare}
                    disabled={isCheckingScreen}
                    className="px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold rounded hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition-all disabled:opacity-50"
                  >
                    {isCheckingScreen ? (
                      <span className="flex items-center gap-1"><Loader2 className="animate-spin" size={14} /> Checking...</span>
                    ) : screenTested ? "Retest Screen Share" : "Test Screen Share"}
                  </button>
                  {screenTested && !isCheckingScreen && <CheckCircle className="text-[var(--accent-color)]" />}
                </div>
              </div>

              {/* Note: this stream is intentionally short-lived — it exists
                  only to validate the permission grant and surface selection
                  ahead of time. The interview page opens its own stream. */}
              {isCheckingScreen && (
                <div className="mt-4 pt-4 border-t border-[var(--border-color)]/30">
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Verifying — this preview will close automatically:</p>
                  <video ref={screenPreviewRef} autoPlay muted className="w-full h-24 object-contain rounded border border-[var(--border-color)] bg-black" />
                </div>
              )}
            </div>
          </div>

          <div className="pt-6 mt-4 border-t border-[var(--border-color)]">
            <button 
              onClick={handleStartInterview}
              disabled={!allTestsPassed || isInitializing}
              className="w-full py-4 bg-[var(--accent-color)] text-[var(--text-inverse)] font-black text-lg rounded-xl hover:opacity-90 transition-all uppercase tracking-wide disabled:opacity-50 disabled:bg-[var(--border-color)] disabled:text-[var(--text-secondary)] flex justify-center items-center gap-2 shadow-lg"
            >
              {isInitializing ? (
                <><Loader2 className="animate-spin" size={24} /> Generating Blueprint...</>
              ) : "Enter Interview Environment"}
            </button>
            {!screenTested && (
              <p className="text-xs text-center text-[var(--text-secondary)] mt-2">
                You'll be asked to share your screen once more when the interview starts — browsers require a fresh permission grant on each page.
              </p>
            )}
          </div>

        </div>
      </div>
      <ToastContainer position="top-right" autoClose={4000} theme="colored" />
    </div>
  );
}