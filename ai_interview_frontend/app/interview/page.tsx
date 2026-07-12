"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, Mic, Volume2, CheckCircle, Loader2, PlayCircle, ShieldAlert, RefreshCw } from "lucide-react";
import { apiClient } from "../lib/api";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function PreFlightPage() {
  const router = useRouter();
  
  // --- Hardware State ---
  const [cameraTested, setCameraTested] = useState(false);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [micTested, setMicTested] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  
  // --- Recording State ---
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micAudioUrl, setMicAudioUrl] = useState<string | null>(null);
  
  // --- Initialization State ---
  const [isInitializing, setIsInitializing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
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
      }, 5000);

    } catch (err) {
      toast.error("Microphone access denied.");
    }
  };

  // 4. Initialize Backend Session
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

  const allTestsPassed = cameraTested && speakerTested && micTested && consentGiven;

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
              <li>3. Accumulating 3 strikes results in immediate session termination.</li>
              <li>4. Your screen and audio are recorded for final evaluation.</li>
            </ul>
            <label className="flex items-start gap-3 cursor-pointer p-3 bg-[var(--surface-card-color)] rounded border border-[var(--border-color)]">
              <input 
                type="checkbox" 
                className="mt-1 w-4 h-4 accent-[var(--accent-color)]"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
              />
              <span className="text-sm text-[var(--text-secondary)] font-bold">
                I understand the rules and consent to audio/video recording.
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
                    <p className="text-xs text-[var(--text-secondary)]">Record a 5-second test clip.</p>
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