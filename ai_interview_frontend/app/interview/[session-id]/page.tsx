"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { ShieldAlert, Mic, Loader2, Square, Activity } from "lucide-react";
import { toast } from "react-toastify";
import { apiClient } from "@/app/lib/api";

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
  const sessionId = params.session_id as string;

  // --- State ---
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [showStrikeModal, setShowStrikeModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);
  const [currentQuestionText, setCurrentQuestionText] = useState("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const absenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Initialization & Security Redirect ---
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
      startCamera();
      speakQuestion(parsed[0].question_text);
    } catch (e) {
      router.replace("/interview");
    }
  }, [router]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      toast.error("Hardware access lost. You must allow camera/mic.");
    }
  };

  // --- Native Text-to-Speech (AI Voice) ---
  const speakQuestion = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel(); // Clear queue
    
    const utterance = new SpeechSynthesisUtterance(text);
    // Try to find a professional sounding English voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang === "en-US" && v.name.includes("Google")) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.rate = 0.95; 
    utterance.onstart = () => setAiSpeaking(true);
    utterance.onend = () => setAiSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  // --- Proctoring Logic ---
  useEffect(() => {
    const handleBlur = () => {
      // Pause recording if tab switched to prevent cheating via reading
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.pause();
      }

      setStrikes(prev => {
        const newStrikes = prev + 1;
        if (newStrikes >= 3) {
          terminateSession();
          return newStrikes;
        }
        setShowStrikeModal(true);
        return newStrikes;
      });

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
      if (absenceTimerRef.current) clearInterval(absenceTimerRef.current);
      window.speechSynthesis.cancel();
    };
  }, []);

  const terminateSession = () => {
    toast.error("SESSION TERMINATED: Maximum proctoring violations reached.");
    router.replace(`/interview/${sessionId}/results`);
  };

  // --- Recording & Backend Integration ---
  const toggleRecording = () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;

    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      audioChunksRef.current = [];
      const stream = videoRef.current.srcObject as MediaStream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        await processAudioChunk();
      };

      mediaRecorder.start();
      setIsRecording(true);
    }
  };

  const processAudioChunk = async () => {
    if (audioChunksRef.current.length === 0) return;
    setIsProcessingChunk(true);

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const currentQ = questions[currentIndex];

    const formData = new FormData();
    formData.append("session_id", sessionId);
    formData.append("question_id", currentQ.id.toString());
    formData.append("audio_blob", audioBlob, `${sessionId}_q${currentQ.id}.webm`);

    try {
      const response = await apiClient.post("/api/v1/audio/process-chunk", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      if (response.data.status === "clarification_required") {
        // Interceptor caught a request for help
        toast.info("Clarifying question...");
        setCurrentQuestionText(response.data.simplified_question);
        speakQuestion(response.data.simplified_question);
      } else {
        // Answer accepted, move to next question
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
      toast.error("Failed to process answer. Please try speaking again.");
    } finally {
      setIsProcessingChunk(false);
    }
  };

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-[var(--accent-color)]" size={48} /></div>;

  return (
    <div className="relative flex flex-col lg:flex-row h-[calc(100vh-80px)] bg-[var(--bg-color)] overflow-hidden">
      
      {showStrikeModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 px-4">
          <div className="bg-[var(--surface-card-color)] border-2 border-[var(--accent-color)] p-6 md:p-8 rounded-xl max-w-lg w-full text-center shadow-2xl">
            <ShieldAlert className="text-[var(--accent-color)] mx-auto mb-4" size={64} />
            <h2 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] mb-2 uppercase">Focus Lost</h2>
            <p className="text-[var(--text-secondary)] mb-6 text-sm md:text-base">
              The system detected you left the interview window. This is a strict violation of the proctoring rules.
              <br /><br />
              <strong className="text-[var(--accent-color)] text-xl">Strike {strikes} of 3</strong>
            </p>
            <button 
              onClick={() => setShowStrikeModal(false)}
              className="w-full py-4 bg-[var(--accent-color)] text-[var(--bg-color)] font-black uppercase tracking-widest rounded-lg hover:opacity-90"
            >
              I Understand, Return to Interview
            </button>
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
          Session: {sessionId.substring(0,8)}...
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
            onClick={toggleRecording}
            disabled={aiSpeaking || isProcessingChunk}
            className={`flex-1 py-4 flex items-center justify-center gap-2 font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isRecording ? 'bg-red-500/10 text-red-500 border border-red-500' : 'bg-[var(--accent-color)] text-[var(--bg-color)] hover:opacity-90'}`}
          >
            {isProcessingChunk ? (
              <><Loader2 className="animate-spin" size={18} /> Processing...</>
            ) : isRecording ? (
              <><Square size={18} fill="currentColor" /> Submit Answer</>
            ) : (
              <><Mic size={18} /> Start Answering</>
            )}
          </button>
        </div>
      </div>

      <div className="w-full lg:w-1/4 xl:w-1/5 bg-[var(--surface-card-color)] border-t lg:border-t-0 lg:border-l border-[var(--border-color)]/30 flex flex-col items-center justify-center p-8 py-12 lg:py-8">
        <div className="relative w-32 h-32 md:w-48 md:h-48 flex items-center justify-center">
          <div className={`absolute inset-0 border-2 border-[var(--accent-color)] rounded-full transition-transform duration-300 ${aiSpeaking ? 'scale-110 opacity-50 animate-ping' : 'scale-100 opacity-20'}`} />
          <div className="absolute inset-4 bg-[var(--accent-color)] rounded-full shadow-[0_0_30px_var(--accent-color)] flex items-center justify-center">
            <Activity className="text-[var(--bg-color)]" size={32} />
          </div>
        </div>
        <p className="mt-8 text-sm font-bold text-[var(--text-secondary)] uppercase tracking-widest text-center">
          {aiSpeaking ? "AI is Speaking..." : isRecording ? "Listening to you..." : "Awaiting Input..."}
        </p>
      </div>

    </div>
  );
}