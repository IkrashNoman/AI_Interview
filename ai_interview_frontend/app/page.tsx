"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Rocket, FileText } from "lucide-react";

type UploadState = "idle" | "processing";

export default function Home() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    if (selectedFile.type === "application/pdf") {
      setFile(selectedFile);
    } else {
      alert("System Error: Only PDF files are accepted.");
    }
  };

  const extractResumeData = () => {
    if (!file) return;
    setUploadState("processing");

    // Mocking the FastAPI JSON Extraction latency
    setTimeout(() => {
      // In production, you will pass the parsed JSON state to the next route via Context, Redux, or URL params
      router.push("/analysis");
    }, 4000); 
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center min-h-[calc(100vh-80px)]">
      <div className="text-center mb-10 w-full">
        <h1 className="text-4xl font-black mb-2 text-[var(--text-primary)] tracking-tight">Resume Uploader</h1>
        <p className="text-[var(--text-secondary)]">Upload your resume to extract and verify your professional profile.</p>
      </div>

      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => uploadState === "idle" && fileInputRef.current?.click()}
        className={`w-full h-64 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden
          ${uploadState === "idle" ? "cursor-pointer" : "cursor-default"}
          ${isDragging 
            ? "border-[var(--accent-color)] bg-[var(--accent-color)]/10 scale-[1.02]" 
            : "border-[var(--border-color)] bg-[var(--surface-card-color)] hover:border-[var(--text-primary)]"
          }
        `}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="application/pdf" className="hidden" />

        <div className="flex flex-col items-center justify-center z-10">
          {uploadState === "idle" && !file && (
            <>
              <div className="w-16 h-16 rounded-full bg-[var(--bg-color)] border border-[var(--border-color)] flex items-center justify-center mb-4 shadow-sm group-hover:shadow-md transition-all">
                <UploadCloud size={32} className={`text-[var(--text-secondary)] transition-colors ${isDragging ? "text-[var(--accent-color)]" : ""}`} />
              </div>
              <p className="font-bold text-[var(--text-primary)]">Select a file, drop it, or paste it</p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">PDF format only</p>
            </>
          )}

          {uploadState === "idle" && file && (
            <>
              <div className="w-16 h-16 rounded-full bg-[var(--accent-color)]/10 flex items-center justify-center mb-4">
                <FileText size={32} className="text-[var(--accent-color)]" />
              </div>
              <p className="font-bold text-[var(--text-primary)]">{file.name}</p>
              <button 
                onClick={(e) => { e.stopPropagation(); extractResumeData(); }}
                className="mt-4 px-6 py-2 bg-[var(--accent-color)] text-[var(--bg-color)] font-bold rounded-lg hover:opacity-90 transition-all"
              >
                Extract Data
              </button>
            </>
          )}

          {uploadState === "processing" && (
            <div className="flex flex-col items-center animate-pulse">
              <div className="w-16 h-16 rounded-full bg-[var(--accent-color)] flex items-center justify-center mb-4 -translate-y-4 animate-[bounce_2s_infinite]">
                <Rocket size={32} className="text-[var(--bg-color)]" />
              </div>
              <p className="font-bold text-[var(--accent-color)]">Parsing PDF with AI...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}