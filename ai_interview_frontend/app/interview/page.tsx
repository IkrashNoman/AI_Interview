"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, Mic, Volume2, CheckCircle, Loader2, PlayCircle, ShieldAlert, RefreshCw, ScreenShare, Activity } from "lucide-react";
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
  
  // --- Recording & VAD States ---
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micAudioUrl, setMicAudioUrl] = useState<string | null>(null);
  const [isCheckingScreen, setIsCheckingScreen] = useState(false);
  const [localMicVolume, setLocalMicVolume] = useState(0);
  const [speechDetected, setSpeechDetected] = useState(false);
  
  // --- Initialization State ---
  const [isInitializing, setIsInitializing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  
  // --- VAD Testing Refs ---
  const localVadInstanceRef = useRef<any>(null);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const hasInitialized = useRef(false);

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
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    
    startCamera();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      cleanupLocalVAD();
    };
  }, []);

  const cleanupLocalVAD = () => {
    if (localVadInstanceRef.current) {
      try { localVadInstanceRef.current.destroy?.(); } catch (e) {}
      localVadInstanceRef.current = null;
    }
    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach(track => track.stop());
      localAudioStreamRef.current = null;
    }
  };

  // 2. Speaker Logic
  const testSpeaker = () => {
    setSpeakerTested(false);
    const audio = new Audio('/speaker-test.wav'); 
    audio.play()
      .then(() => setSpeakerTested(true))
      .catch(() => toast.error("Failed to play test audio. Check your volume."));
  };

  // 3. Microphone & Local Dynamic VAD Pipeline Execution
  const testMicrophone = async () => {
    try {
      setMicTested(false);
      setSpeechDetected(false);
      setLocalMicVolume(0);
      cleanupLocalVAD();
      
      if (micAudioUrl) {
        URL.revokeObjectURL(micAudioUrl);
        setMicAudioUrl(null);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      localAudioStreamRef.current = stream;

      // Lazy import browser-optimized variant
      const { MicVAD } = await import("@ricky0123/vad-web");

      const vadOptions: any = {
        getStream: async () => stream,

        baseAssetPath: "/",
        onnxWASMBasePath: "/",
        model: "v5",

        onFrameProcessed: (probabilities: any) => {
          const isSpeechProb = probabilities.isSpeech;
          setLocalMicVolume(Math.round(isSpeechProb * 100));
          if (isSpeechProb > 0.50) {
            setSpeechDetected(true);
          }
        },
      };

      const vad = await MicVAD.new(vadOptions);
      localVadInstanceRef.current = vad;
      vad.start();

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
        
        vad.pause();
        setIsRecordingMic(false);
      };

      mediaRecorder.start();
      setIsRecordingMic(true);

      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 6000);

    } catch (err: any) {
      console.log("===[ VAD RUNTIME FAILURE ]===", err);
      toast.error("Microphone access denied or VAD engine initialization failed.");
    }
  };

  // 4. Screen-Share Logic
  const testScreenShare = async () => {
    setIsCheckingScreen(true);
    setScreenTested(false);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
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

      if (typeof window !== "undefined") {
        (window as any).__screenStream = stream;
      }

      setScreenTested(true);
      setIsCheckingScreen(false);

      track.onended = () => {
        if (typeof window !== "undefined") {
          (window as any).__screenStream = null;
        }
        setScreenTested(false);
        toast.error("Screen sharing stopped. Entire screen sharing is required to proceed.");
      };

    } catch (err) {
      toast.error("Screen sharing was denied or cancelled.");
      setIsCheckingScreen(false);
    }
  };

  // 5. Initialize Backend Session
  const handleStartInterview = async () => {
    setIsInitializing(true);
    cleanupLocalVAD();
    
    const savedResume = sessionStorage.getItem("extractedResume");
    if (!savedResume) {
      toast.error("Resume data missing. Please return to analysis.");
      router.push("/analysis");
      return;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
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
  const visualizerScale = isRecordingMic ? 1 + (localMicVolume / 100) : 1;

  return (
    <div className="max-w-[1000px] mx-auto px-4 py-8 min-h-[calc(100vh-80px)]">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black text-[var(--text-primary)]">System Diagnostics</h1>
        <p className="text-[var(--text-secondary)] mt-2">Complete the hardware checks to unlock the interview environment.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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

        <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 shadow-lg flex flex-col">
          <h2 className="text-xl font-black mb-6 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Hardware Validation</h2>
          
          <div className="flex-1 space-y-6">
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

            <div className={`flex flex-col p-4 rounded-lg border ${micTested ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10' : 'border-[var(--border-color)] bg-[var(--bg-color)]'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mic className={micTested ? "text-[var(--accent-color)]" : "text-[var(--text-secondary)]"} />
                  <div>
                    <h4 className="font-bold text-[var(--accent-color)]">Microphone & VAD Check</h4>
                    <p className="text-xs text-[var(--text-secondary)]">Say something to wake up engine analytics.</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {isRecordingMic ? (
                    <span className="text-[var(--accent-color)] text-xs font-bold animate-pulse flex items-center gap-1">
                      <div className="w-2 h-2 bg-[var(--accent-color)] rounded-full"></div> Listening...
                    </span>
                  ) : (
                    <button onClick={testMicrophone} className="px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold rounded hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition-all">
                      {micTested ? "Retest Audio Model" : "Verify Voice Engine"}
                    </button>
                  )}
                  {micTested && !isRecordingMic && <CheckCircle className="text-[var(--accent-color)]" />}
                </div>
              </div>
              
              {isRecordingMic && (
                <div className="mt-4 p-4 rounded-xl bg-black/10 border border-[var(--border-color)]/40 flex flex-col items-center justify-center gap-3">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <div
                      className="absolute inset-0 border border-[var(--accent-color)] rounded-full transition-all duration-700 opacity-60"
                      style={{ transform: `scale(${visualizerScale})` }}
                    />
                    <div className="absolute inset-2 bg-[var(--accent-color)] rounded-full flex items-center justify-center">
                      <Activity className="text-white" size={18} />
                    </div>
                  </div>
                  <p className="text-xs font-black tracking-widest uppercase text-[var(--text-secondary)] text-center">
                    {speechDetected ? "✓ Dynamic Vocal Signal Decoded" : "Awaiting Audio Frequency..."}
                  </p>
                </div>
              )}
              
              {micAudioUrl && !isRecordingMic && (
                <div className="mt-4 pt-4 border-t border-[var(--border-color)]/30">
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Listen to your recording to ensure clarity:</p>
                  <audio controls src={micAudioUrl} className="h-8 w-full outline-none" />
                </div>
              )}
            </div>

            <div className={`flex flex-col p-4 rounded-lg border ${screenTested ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10' : 'border-[var(--border-color)] bg-[var(--bg-color)]'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ScreenShare className={screenTested ? "text-[var(--accent-color)]" : "text-[var(--text-secondary)]"} />
                  <div>
                    <h4 className="font-bold text-[var(--accent-color)]">Screen Recording</h4>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {screenTested ? "Entire-screen sharing active." : "Confirm you can share your ENTIRE screen."}
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

              {screenTested && (
                <div className="mt-4 pt-4 border-t border-[var(--border-color)]/30">
                  <p className="text-xs text-[var(--text-secondary)] mb-2">Screen Share Active. Ready for transition.</p>
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
          </div>
        </div>
      </div>
      <ToastContainer position="top-right" autoClose={4000} theme="colored" />
    </div>
  );
}