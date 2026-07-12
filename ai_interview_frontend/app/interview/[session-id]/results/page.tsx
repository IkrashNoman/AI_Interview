"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  BarChart, MessageSquare, Activity, CheckCircle, XCircle, ShieldAlert, Loader2, ArrowLeft
} from "lucide-react";
import { apiClient } from "@/app/lib/api";

interface DetailedEvaluation {
  question_id: number;
  structure_score: number;
  correctness_score: number;
  completeness_score: number;
  filler_words: number;
  wpm: number;
}

export default function InterviewResultsPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.session_id as string;

  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;

    const fetchResults = async () => {
      try {
        const response = await apiClient.get(`/api/v1/interview/${sessionId}/results`);
        setResults(response.data);
      } catch (error) {
        console.error("Failed to fetch results:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [sessionId]);

  if (loading) return <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4 text-center"><Loader2 className="animate-spin text-[var(--accent-color)] mb-4" size={48} /><h2 className="text-xl font-black text-[var(--text-primary)]">Aggregating Neural Metrics...</h2></div>;
  if (!results || results.status === "pending") return <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4 text-center"><XCircle className="text-red-500 mb-4" size={48} /><h2 className="text-xl font-black text-[var(--text-primary)]">Data Retrieval Failed</h2><p className="text-[var(--text-secondary)] mt-2">Scores are still processing or the session is invalid.</p></div>;

  const { metrics, detailed_evaluations } = results;
  const isSuspicious = metrics.overall_interview_score >= 95;

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 md:py-12 min-h-[calc(100vh-80px)]">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-[var(--border-color)] pb-6 mb-8 gap-4">
        <div>
          <button onClick={() => router.push("/")} className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent-color)] mb-4 text-sm font-bold transition-colors">
            <ArrowLeft size={16} /> Exit to Dashboard
          </button>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-[var(--text-primary)] uppercase tracking-wide">Performance Matrix</h1>
          <p className="text-[var(--text-secondary)] mt-1 text-xs sm:text-sm truncate w-full max-w-[300px] md:max-w-none">Session ID: {sessionId}</p>
        </div>
        <div className="text-left md:text-right w-full md:w-auto bg-[var(--surface-card-color)] md:bg-transparent p-4 md:p-0 rounded-lg border border-[var(--border-color)] md:border-none mt-4 md:mt-0">
          <span className="text-xs sm:text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1">Overall Score</span>
          <div className="text-5xl md:text-6xl font-black text-[var(--text-primary)]">
            {metrics.overall_interview_score.toFixed(1)}<span className="text-2xl md:text-3xl text-[var(--text-secondary)]">%</span>
          </div>
        </div>
      </div>

      {isSuspicious && (
        <div className="bg-red-500/10 border-l-4 border-red-500 p-4 md:p-6 mb-8 rounded-r-xl flex flex-col sm:flex-row gap-4 items-start shadow-sm">
          <ShieldAlert className="text-red-500 shrink-0" size={32} />
          <div>
            <h3 className="text-red-500 font-black text-lg md:text-xl uppercase tracking-wider mb-2">Trust Warning: Synthetic Assistance Probability High</h3>
            <p className="text-[var(--text-primary)] text-xs md:text-sm leading-relaxed">
              Score: {metrics.overall_interview_score.toFixed(1)}%. In deeply technical system design evaluations, scores above 95% strongly correlate with LLM script-reading. Proceed with rigorous manual video review.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 mb-12">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[ 
            { label: "Structure", score: metrics.average_structure, icon: BarChart, desc: "Logical progression." },
            { label: "Correctness", score: metrics.average_correctness, icon: CheckCircle, desc: "Factual accuracy." },
            { label: "Completeness", score: metrics.average_completeness, icon: Activity, desc: "Concept coverage." }
          ].map((item, i) => (
            <div key={i} className="bg-[var(--surface-card-color)] border border-[var(--border-color)] p-4 md:p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs md:text-sm font-bold text-[var(--text-secondary)] uppercase">{item.label}</span>
                <item.icon size={18} className="text-[var(--text-primary)]" />
              </div>
              <div className="text-3xl font-black text-[var(--text-primary)]">{item.score.toFixed(1)}%</div>
              <p className="text-xs text-[var(--text-secondary)] mt-2">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-[var(--bg-color)] border border-[var(--accent-color)]/30 rounded-xl p-4 md:p-6 shadow-sm border-t-4 border-t-[var(--accent-color)]">
          <h3 className="text-md md:text-lg font-black text-[var(--text-primary)] mb-6 flex items-center gap-2">
            <MessageSquare size={20} className="text-[var(--accent-color)]" /> Delivery Analytics
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-end mb-1">
                <span className="text-xs md:text-sm font-bold text-[var(--text-secondary)]">Speech Pacing (WPM)</span>
                <span className="text-lg md:text-xl font-black text-[var(--text-primary)]">{metrics.communication.average_wpm}</span>
              </div>
              <div className="w-full bg-[var(--surface-card-color)] h-2 rounded-full overflow-hidden border border-[var(--border-color)]">
                <div className="bg-[var(--text-primary)] h-full" style={{ width: `${Math.min(100, (metrics.communication.average_wpm / 150) * 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-end mb-1">
                <span className="text-xs md:text-sm font-bold text-[var(--text-secondary)]">Filler Words</span>
                <span className="text-lg md:text-xl font-black text-[var(--text-primary)]">{metrics.communication.total_filler_words}</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{metrics.communication.total_filler_words > 30 ? "Heavy reliance on verbal crutches." : "Acceptable pausing."}</p>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-xl md:text-2xl font-black text-[var(--text-primary)] mb-6 uppercase">Question Breakdown</h2>
      <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[600px] whitespace-nowrap">
            <thead>
              <tr className="bg-[var(--bg-color)] border-b border-[var(--border-color)] text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                <th className="p-3 md:p-4 font-bold w-16">Q#</th>
                <th className="p-3 md:p-4 font-bold">Structure</th>
                <th className="p-3 md:p-4 font-bold">Correctness</th>
                <th className="p-3 md:p-4 font-bold">Completeness</th>
                <th className="p-3 md:p-4 font-bold">Fillers</th>
                <th className="p-3 md:p-4 font-bold">Pacing</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-[var(--border-color)]/50">
              {detailed_evaluations.map((evalData: DetailedEvaluation) => (
                <tr key={evalData.question_id} className="hover:bg-[var(--bg-color)]/50 transition-colors">
                  <td className="p-3 md:p-4 font-black text-[var(--text-primary)]">{evalData.question_id}</td>
                  <td className="p-3 md:p-4 text-[var(--text-primary)] font-bold">{evalData.structure_score}%</td>
                  <td className="p-3 md:p-4 text-[var(--text-primary)] font-bold">{evalData.correctness_score}%</td>
                  <td className="p-3 md:p-4 text-[var(--text-primary)] font-bold">{evalData.completeness_score}%</td>
                  <td className="p-3 md:p-4 text-[var(--text-secondary)]">{evalData.filler_words}</td>
                  <td className="p-3 md:p-4 text-[var(--text-secondary)]">{evalData.wpm} WPM</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}