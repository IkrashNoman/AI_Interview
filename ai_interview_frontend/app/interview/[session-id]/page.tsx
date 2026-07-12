"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, AlertOctagon, Send, Loader2, StopCircle, Volume2 } from "lucide-react";
import { apiClient } from "../../lib/api";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface Question {
  id: number;
  stage: string;
  category: string;
  difficulty: string;
  question_text: string;
  expected_keywords: string[];
}

export default function InterviewRoom({ params }: { params: Promise<{ session_id: string }> }) {
  const router = useRouter();
  
  // Unwrap params using React.use()
  const unwrappedParams = use(params);
  const sessionId = unwrappedParams.session_id;

  // --- State: Blueprint & Progression ---
  const [blueprint, setBlueprint] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // --- State: UI & AI ---
  const [aiState, setAiState] = useState<"speaking" | "listening" | "processing">("speaking");
  const [displayedText, setDisplayedText] = useState("Initializing secure environment...");
  
  // --- State: Media & Recording ---
  const [isRecording, setIsRecording] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  
  // --- State: Proctoring ---
  const [strikes, setStrikes] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [isTerminated, setIsTerminated] = useState(false);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const absenceIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 1. Load Blueprint
    const savedData = sessionStorage.getItem("interviewBlueprint");
    if (!savedData) {
      toast.error("Session data lost. Returning to setup.");
      router.push("/interview");
      return;
    }
    const parsed = JSON.parse(savedData);
    setBlueprint(parsed);

    // 2. Start Local Camera Feed
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        
        // Add a slight delay before asking the first question
        setTimeout(() => {
          askQuestion(parsed[0].question_text);
        }, 1500);
      })
      .catch(() => {
        toast.error("Camera/Mic access lost. Cannot continue.");
        setIsTerminated(true);
      });

    return () => {
      // Cleanup streams on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (isTerminated || isCompleted) return;

    const handleBlur = () => {
      // Strike 1: Leaving the window
      setStrikes(prev => {
        const newStrikes = prev + 1;
        if (newStrikes >= 3) triggerTermination();
        return newStrikes;
      });
      setShowWarningModal(true);

      // Start 5-second continuous absence timer
      absenceIntervalRef.current = setInterval(() => {
        setStrikes(prev => {
          const newStrikes = prev + 1;
          if (newStrikes >= 3) triggerTermination();
          return newStrikes;
        });
      }, 5000);
    };

    const handleFocus = () => {
      if (absenceIntervalRef.current) {
        clearInterval(absenceIntervalRef.current);
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      if (absenceIntervalRef.current) clearInterval(absenceIntervalRef.current);
    };
  }, [isTerminated, isCompleted]);

  const triggerTermination = () => {
    setIsTerminated(true);
    setShowWarningModal(false);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    window.speechSynthesis.cancel();
    // In production, send a final POST to backend to mark session as CHEATED
  };

  const askQuestion = (text: string) => {
    setAiState("speaking");
    setDisplayedText(text);
    
    // Stop any existing recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    // Try to find a good English voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang === "en-US" && v.name.includes("Google")) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.rate = 1.0;
    
    utterance.onend = () => {
      startListening();
    };

    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    if (!streamRef.current) return;
    
    setAiState("listening");
    setIsRecording(true);
    audioChunksRef.current = [];
    
    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      setIsRecording(false);
      handleChunkUpload();
    };

    mediaRecorder.start();

    // Setup Voice Activity Detection (VAD)
    setupVAD(streamRef.current);
  };

  const setupVAD = (stream: MediaStream) => {
    const audioCtx = new window.AudioContext();
    audioContextRef.current = audioCtx;
    const analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    
    analyser.fftSize = 512;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkAudioLevel = () => {
      if (mediaRecorderRef.current?.state !== "recording") return;

      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const averageVolume = sum / bufferLength;
      setVolumeLevel(averageVolume);

      // Silence Threshold (Adjust based on testing, usually ~10)
      if (averageVolume > 15) {
        // User is speaking, reset silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else {
        // User is silent, start timer if not already started
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            // 6 Seconds of silence triggered
            stopRecording();
          }, 6000); // 6 second VAD cutoff
        }
      }

      requestAnimationFrame(checkAudioLevel);
    };

    checkAudioLevel();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
  };

  const handleChunkUpload = async () => {
    setAiState("processing");
    setDisplayedText("Analyzing response...");

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const currentQ = blueprint[currentIdx];

    const formData = new FormData();
    formData.append("session_id", sessionId);
    formData.append("question_id", currentQ.id.toString());
    formData.append("audio_blob", audioBlob, `q${currentQ.id}.webm`);

    try {
      const response = await apiClient.post("/api/v1/audio/process-chunk", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      // INTERCEPTOR CHECK
      if (response.data.status === "clarification_required") {
        askQuestion(response.data.simplified_question);
        return; // Do not advance index
      }

      // Normal Advancement
      const nextIdx = currentIdx + 1;
      if (nextIdx < blueprint.length) {
        setCurrentIdx(nextIdx);
        askQuestion(blueprint[nextIdx].question_text);
      } else {
        setIsCompleted(true);
        setDisplayedText("Interview Complete. Compiling final results...");
        setTimeout(() => {
          router.push(`/interview/${sessionId}/results`);
        }, 2000);
      }

    } catch (error) {
      console.error("Upload failed", error);
      toast.error("Network error. Please try answering again.");
      // Fallback: ask the same question again
      askQuestion(currentQ.question_text);
    }
  };

  if (isTerminated) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] bg-red-950/20 text-center px-4">
        <AlertOctagon size={80} className="text-red-500 mb-4 animate-pulse" />
        <h1 className="text-4xl font-black text-red-500 mb-2">SESSION TERMINATED</h1>
        <p className="text-[var(--text-secondary)] max-w-lg">
          The system has detected multiple severe proctoring violations (tab switching or loss of window focus). 
          Your session has been invalidated and the event has been logged.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8 h-[calc(100vh-80px)] flex flex-col relative">
      
      {/* 3-Strike Warning Modal */}
      {showWarningModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--surface-color)]/90 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-color)] border-2 border-[var(--accent-color)] rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
            <AlertOctagon size={48} className="text-[var(--accent-color)] mx-auto mb-4" />
            <h2 className="text-2xl font-black text-[var(--text-primary)] mb-2">FOCUS LOST</h2>
            <p className="text-[var(--text-secondary)] mb-6 font-bold">
              The system detected you left the interview window. Return to this window immediately.
            </p>
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3].map(s => (
                <div key={s} className={`w-12 h-3 rounded-full ${s <= strikes ? 'bg-red-500' : 'bg-[var(--border-color)]/30'}`} />
              ))}
            </div>
            <p className="text-red-500 font-bold mb-6">Strike {strikes} of 3</p>
            <button 
              onClick={() => setShowWarningModal(false)}
              className="w-full py-3 bg-[var(--accent-color)] text-[var(--bg-color)] font-black rounded-xl hover:opacity-90 transition-all"
            >
              I Understand, Continue
            </button>
          </div>
        </div>
      )}

      {/* Header Info */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-[var(--text-primary)]">Technical Interview</h2>
          <p className="text-[var(--accent-color)] font-bold text-sm">
            Question {Math.min(currentIdx + 1, blueprint.length)} of {blueprint.length}
          </p>
        </div>
        <div className="flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} title="Proctoring Strikes" className={`w-3 h-3 rounded-full ${i < strikes ? 'bg-red-500' : 'bg-green-500'}`} />
          ))}
        </div>
      </div>

      {/* Main Stage */}
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* Left: User Camera */}
        <div className="lg:col-span-1 bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-2xl p-4 flex flex-col">
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden mb-4 shadow-inner">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
            {isRecording && (
              <div className="absolute top-3 left-3 bg-red-500/90 text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1 animate-pulse">
                <div className="w-2 h-2 bg-white rounded-full" /> REC
              </div>
            )}
          </div>
          
          <div className="bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)] flex-grow">
            <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Stage Progression</h4>
            <div className="space-y-2">
              {blueprint.length > 0 && (
                <p className="text-sm font-bold text-[var(--accent-color)]">{blueprint[currentIdx]?.stage}</p>
              )}
              {blueprint.length > 0 && (
                <p className="text-xs text-[var(--text-secondary)]">Focus: {blueprint[currentIdx]?.category}</p>
              )}
            </div>
          </div>
        </div>

        {/* Middle & Right: Transcript and AI */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* AI Visualizer Container */}
          <div className="h-48 bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-2xl flex items-center justify-center relative overflow-hidden">
            
            {/* Pulsing AI Circle */}
            <div className="relative flex items-center justify-center">
              {aiState === "speaking" && (
                <>
                  <div className="absolute w-32 h-32 bg-[var(--accent-color)]/20 rounded-full animate-ping" />
                  <div className="absolute w-24 h-24 bg-[var(--accent-color)]/40 rounded-full animate-pulse" />
                </>
              )}
              {aiState === "listening" && (
                <div 
                  className="absolute rounded-full bg-[var(--text-secondary)]/10 transition-all duration-75"
                  style={{ width: `${100 + volumeLevel}px`, height: `${100 + volumeLevel}px` }}
                />
              )}
              <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg z-10 transition-colors duration-300 ${
                aiState === "speaking" ? "bg-[var(--accent-color)]" : 
                aiState === "listening" ? "bg-[var(--bg-color)] border-2 border-[var(--accent-color)]" : 
                "bg-[var(--border-color)]"
              }`}>
                {aiState === "speaking" ? <Volume2 className="text-[var(--text-inverse)]" /> : 
                 aiState === "listening" ? <Mic className="text-[var(--accent-color)]" /> : 
                 <Loader2 className="text-white animate-spin" />}
              </div>
            </div>

            <div className="absolute bottom-4 left-0 w-full text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                {aiState === "speaking" ? "AI Interviewer Speaking..." : 
                 aiState === "listening" ? "Listening to your response..." : 
                 "Processing Data..."}
              </span>
            </div>
          </div>

          {/* Transcript / Question Box */}
          <div className="flex-grow bg-[var(--bg-color)] border border-[var(--border-color)] rounded-2xl p-6 md:p-8 flex items-center shadow-inner">
            <h3 className={`text-xl md:text-2xl font-medium leading-relaxed transition-opacity duration-300 ${aiState === "processing" ? "text-[var(--text-secondary)] opacity-50" : "text-[var(--text-primary)]"}`}>
              "{displayedText}"
            </h3>
          </div>

        </div>
      </div>

      {/* Footer Controls */}
      <div className="flex justify-between items-center pt-4 border-t border-[var(--border-color)]">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          {aiState === "listening" ? (
            <><Mic className="animate-pulse text-[var(--accent-color)]" size={16} /> Auto-submits after 6 seconds of silence</>
          ) : (
            <><MicOff size={16} /> Microphone muted</>
          )}
        </div>
        
        <button
          onClick={stopRecording}
          disabled={aiState !== "listening"}
          className="px-6 py-3 bg-[var(--accent-color)] text-[var(--bg-color)] font-black rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:bg-[var(--border-color)] flex items-center gap-2 shadow-lg"
        >
          {aiState === "listening" ? <><Send size={18} /> Submit Answer</> : <><StopCircle size={18} /> Please Wait</>}
        </button>
      </div>

      <ToastContainer position="top-right" autoClose={4000} theme="colored" />
    </div>
  );
}