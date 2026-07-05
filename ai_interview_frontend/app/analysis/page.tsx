"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, CheckCircle, AlertTriangle, Briefcase, Globe, GitBranch, Link as LinkIcon, X } from "lucide-react";

// --- State Interfaces ---
interface Education { id: string; institution: string; degree: string; startYear: string; endYear: string; }
interface Experience { id: string; company: string; jobTitle: string; startYear: string; endYear: string; skillsUtilized: string; description: string; }
interface Project { id: string; title: string; description: string; techUsed: string; }

type AnalysisStatus = "idle" | "analyzing" | "complete_with_jd" | "complete_without_jd";

export default function AnalysisPage() {
  // --- Section 1: Personal Info ---
  const [personalInfo, setPersonalInfo] = useState({ name: "", phone: "", email: "", linkedin: "", github: "", objective: "" });

  // --- Section 2, 3, 4: Dynamic Arrays ---
  const [educations, setEducations] = useState<Education[]>([{ id: "1", institution: "", degree: "", startYear: "", endYear: "" }]);
  const [experiences, setExperiences] = useState<Experience[]>([{ id: "1", company: "", jobTitle: "", startYear: "", endYear: "", skillsUtilized: "", description: "" }]);
  const [projects, setProjects] = useState<Project[]>([{ id: "1", title: "", description: "", techUsed: "" }]);
  
  // --- Section 5: Skills ---
  const [skills, setSkills] = useState<string[]>([""]);

  // --- Section 6: Job Description ---
  const [jobDescription, setJobDescription] = useState("");

  // --- Right Side State ---
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [mockScore, setMockScore] = useState(0);

  // --- Array Manipulation Helpers ---
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const addEducation = () => setEducations([...educations, { id: generateId(), institution: "", degree: "", startYear: "", endYear: "" }]);
  const removeEducation = (id: string) => educations.length > 1 && setEducations(educations.filter(e => e.id !== id));

  const addExperience = () => setExperiences([...experiences, { id: generateId(), company: "", jobTitle: "", startYear: "", endYear: "", skillsUtilized: "", description: "" }]);
  const removeExperience = (id: string) => experiences.length > 1 && setExperiences(experiences.filter(e => e.id !== id));

  const addProject = () => setProjects([...projects, { id: generateId(), title: "", description: "", techUsed: "" }]);
  const removeProject = (id: string) => projects.length > 1 && setProjects(projects.filter(p => p.id !== id));

  const addSkill = () => setSkills([...skills, ""]);
  const updateSkill = (index: number, value: string) => {
    const newSkills = [...skills];
    newSkills[index] = value;
    setSkills(newSkills);
  };
  const removeSkill = (index: number) => skills.length > 1 && setSkills(skills.filter((_, i) => i !== index));

  // --- Execution Logic ---
  const runAnalysis = () => {
    setStatus("analyzing");
    
    // Simulating backend LLM processing time (5 seconds)
    setTimeout(() => {
      if (jobDescription.trim() === "") {
        setStatus("complete_without_jd");
      } else {
        // Randomize mock score for testing the >75% logic
        const generatedScore = Math.floor(Math.random() * 40) + 55; // Generates between 55 and 95
        setMockScore(generatedScore);
        setStatus("complete_with_jd");
      }
    }, 5000);
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-8 h-[calc(100vh-80px)]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
        
        {/* ================= LEFT COLUMN: DATA VERIFICATION FORM ================= */}
        <div className="flex flex-col h-full overflow-y-auto pr-4 border-r border-[var(--border-color)]/30 custom-scrollbar pb-12">
          
          {/* Section 1: Personal Information */}
          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
            <h2 className="text-xl font-black mb-4 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Section 1: Personal Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="text" placeholder="Full Name" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />
              
              <div className="flex bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg overflow-hidden focus-within:border-[var(--accent-color)]">
                <span className="flex items-center justify-center px-3 bg-[var(--border-color)]/20 text-lg" title="Pakistan">🇵🇰</span>
                <input type="tel" placeholder="+92 Phone Number" className="w-full bg-transparent p-3 text-sm outline-none" />
              </div>
              
              <input type="email" placeholder="Email Address" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />
              <div className="relative">
                <LinkIcon size={16} className="absolute left-3 top-3.5 text-[var(--text-secondary)]" />
                <input type="url" placeholder="LinkedIn URL" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 pl-10 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />
              </div>
              <div className="relative md:col-span-2">
                <GitBranch size={16} className="absolute left-3 top-3.5 text-[var(--text-secondary)]" />
                <input type="url" placeholder="GitHub URL" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 pl-10 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />
              </div>
              <textarea placeholder="Career Objective" className="w-full md:col-span-2 h-24 bg-[var(--bg-color)] border border-[var(--border-color)] p-3 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none resize-none" />
            </div>
          </div>

          {/* Section 2: Education */}
          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
            <h2 className="text-xl font-black mb-4 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Section 2: Education</h2>
            {educations.map((edu, index) => (
              <div key={edu.id} className="relative mb-4 p-4 border border-[var(--border-color)]/50 rounded-lg bg-[var(--bg-color)]">
                {educations.length > 1 && (
                  <button onClick={() => removeEducation(edu.id)} className="absolute top-3 right-3 text-[var(--text-secondary)] hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <input type="text" placeholder="Institution" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" placeholder="Degree" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" placeholder="Start Year" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" placeholder="End Year" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                </div>
              </div>
            ))}
            <button onClick={addEducation} className="flex items-center gap-2 text-sm font-bold text-[var(--accent-color)] hover:opacity-80">
              <Plus size={16} /> Add More Education
            </button>
          </div>

          {/* Section 3: Experience */}
          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
            <h2 className="text-xl font-black mb-4 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Section 3: Experience</h2>
            {experiences.map((exp) => (
              <div key={exp.id} className="relative mb-4 p-4 border border-[var(--border-color)]/50 rounded-lg bg-[var(--bg-color)]">
                {experiences.length > 1 && (
                  <button onClick={() => removeExperience(exp.id)} className="absolute top-3 right-3 text-[var(--text-secondary)] hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <input type="text" placeholder="Company" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" placeholder="Job Title" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" placeholder="Start Year" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" placeholder="End Year" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" placeholder="Skills Utilized (comma separated)" className="w-full md:col-span-2 border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <textarea placeholder="Description" className="w-full md:col-span-2 h-20 border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent resize-none" />
                </div>
              </div>
            ))}
            <button onClick={addExperience} className="flex items-center gap-2 text-sm font-bold text-[var(--accent-color)] hover:opacity-80">
              <Plus size={16} /> Add More Experience
            </button>
          </div>

          {/* Section 4: Projects */}
          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
            <h2 className="text-xl font-black mb-4 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Section 4: Projects</h2>
            {projects.map((proj) => (
              <div key={proj.id} className="relative mb-4 p-4 border border-[var(--border-color)]/50 rounded-lg bg-[var(--bg-color)]">
                {projects.length > 1 && (
                  <button onClick={() => removeProject(proj.id)} className="absolute top-3 right-3 text-[var(--text-secondary)] hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                )}
                <div className="grid grid-cols-1 gap-3 mt-2">
                  <input type="text" placeholder="Project Title" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" placeholder="Technology Used (comma separated)" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <textarea placeholder="Project Description" className="w-full h-20 border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent resize-none" />
                </div>
              </div>
            ))}
            <button onClick={addProject} className="flex items-center gap-2 text-sm font-bold text-[var(--accent-color)] hover:opacity-80">
              <Plus size={16} /> Add More Projects
            </button>
          </div>

          {/* Section 5: Skills */}
          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
            <h2 className="text-xl font-black mb-4 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Section 5: Skills</h2>
            <div className="flex flex-wrap gap-3">
              {skills.map((skill, index) => (
                <div key={index} className="flex items-center bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg overflow-hidden focus-within:border-[var(--accent-color)]">
                  <input 
                    type="text" 
                    value={skill} 
                    onChange={(e) => updateSkill(index, e.target.value)} 
                    placeholder="Skill" 
                    className="p-2 w-32 text-sm bg-transparent outline-none" 
                  />
                  {skills.length > 1 && (
                    <button onClick={() => removeSkill(index)} className="px-2 text-[var(--text-secondary)] hover:text-red-500 transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addSkill} className="flex items-center justify-center w-10 h-[38px] bg-[var(--accent-color)]/10 text-[var(--accent-color)] rounded-lg hover:bg-[var(--accent-color)]/20 transition-colors border border-[var(--accent-color)]/30">
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Section 6: Job Description */}
          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6 shadow-md border-t-4 border-t-[var(--accent-color)]">
            <h2 className="text-xl font-black mb-2 text-[var(--text-primary)]">Section 6: Add Job Description (Optional)</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">Paste the target JD to get a targeted matching score and execution roadmap. Leave blank for general role suggestions.</p>
            <textarea 
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste Job Description here..." 
              className="w-full h-40 bg-[var(--bg-color)] border border-[var(--border-color)] p-4 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none resize-none" 
            />
          </div>

          <button 
            onClick={runAnalysis}
            disabled={status === "analyzing"}
            className="w-full py-4 bg-[var(--accent-color)] text-[var(--bg-color)] font-black text-lg rounded-xl hover:opacity-90 transition-all uppercase tracking-wide disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg"
          >
            {status === "analyzing" ? (
              <><Loader2 className="animate-spin" size={24} /> Processing Data...</>
            ) : "Analyze Profile"}
          </button>
        </div>


        {/* ================= RIGHT COLUMN: READ-ONLY ANALYSIS ================= */}
        <div className="flex flex-col h-full bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-inner sticky top-24">
          
          {/* State 1: Idle */}
          {status === "idle" && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Briefcase size={64} className="text-[var(--border-color)] mb-4 opacity-50" />
              <h3 className="text-2xl font-black text-[var(--text-primary)]">Awaiting Analysis</h3>
              <p className="text-[var(--text-secondary)] mt-2">Fill out the verification form on the left and click analyze to generate your results.</p>
            </div>
          )}

          {/* State 2: Analyzing (Animation) */}
          {status === "analyzing" && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[var(--bg-color)]/50">
              <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 border-4 border-[var(--border-color)] rounded-full"></div>
                <div className="absolute inset-0 border-4 border-[var(--accent-color)] rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={32} className="text-[var(--accent-color)] animate-pulse" />
                </div>
              </div>
              <h3 className="text-2xl font-black text-[var(--accent-color)] animate-pulse">Running Neural Match...</h3>
              <p className="text-[var(--text-secondary)] mt-2">Cross-referencing resume matrix with job requirements.</p>
            </div>
          )}

          {/* State 3: Complete WITH Job Description */}
          {status === "complete_with_jd" && (
            <div className="flex flex-col h-full overflow-y-auto p-8 custom-scrollbar">
              <div className="flex justify-between items-start mb-8 pb-6 border-b border-[var(--border-color)]">
                <div>
                  <h2 className="text-3xl font-black text-[var(--text-primary)]">Analysis Results</h2>
                  <p className="text-[var(--text-secondary)]">Targeted Evaluation</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">Match Score</span>
                  <div className={`text-5xl font-black ${mockScore >= 75 ? 'text-green-500' : 'text-red-500'}`}>
                    {mockScore}%
                  </div>
                </div>
              </div>

              {/* Conditional Threshold Logic */}
              {mockScore >= 75 ? (
                <div className="bg-green-500/10 border border-green-500 rounded-xl p-6 mb-8 flex flex-col items-center text-center">
                  <CheckCircle size={48} className="text-green-500 mb-3" />
                  <h3 className="text-xl font-black text-green-500 mb-2">High Fit Detected</h3>
                  <p className="text-[var(--text-primary)] mb-4">Your profile strongly aligns with this position.</p>
                  <button className="px-6 py-3 bg-green-500 text-white font-bold rounded-lg shadow-lg hover:bg-green-600 transition-colors w-full">
                    Do you want to improve with a Mock Interview?
                  </button>
                </div>
              ) : (
                <div className="bg-red-500/10 border border-red-500 rounded-xl p-6 mb-8 flex flex-col items-center text-center">
                  <AlertTriangle size={48} className="text-red-500 mb-3" />
                  <h3 className="text-xl font-black text-red-500 mb-2">Critical Mismatch</h3>
                  <p className="text-[var(--text-primary)] font-bold">You are not fit for this job.</p>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Apply somewhere else, or complete the execution roadmap below to be prepared before applying.</p>
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-[var(--text-primary)] mb-2 uppercase text-xs tracking-wider">Job Fit Summary</h4>
                  <p className="text-sm text-[var(--text-secondary)] bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50">
                    The candidate possesses foundational knowledge in general software engineering but lacks the specific production-level architecture experience requested in the JD.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50 border-l-4 border-l-green-500">
                    <h4 className="font-bold text-[var(--text-primary)] mb-2">Matched Skills</h4>
                    <ul className="list-disc pl-4 text-sm text-[var(--text-secondary)]">
                      <li>Python</li>
                      <li>REST APIs</li>
                      <li>Git</li>
                    </ul>
                  </div>
                  <div className="bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50 border-l-4 border-l-red-500">
                    <h4 className="font-bold text-[var(--text-primary)] mb-2">Missing Skills</h4>
                    <ul className="list-disc pl-4 text-sm text-[var(--text-secondary)]">
                      <li>PostgreSQL</li>
                      <li>Docker</li>
                      <li>Microservices</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-red-500 mb-2 uppercase text-xs tracking-wider">Experience Gap</h4>
                  <p className="text-sm text-[var(--text-secondary)] bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50">
                    Job requires 3+ years of leading technical teams. You are currently a student with academic project experience.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-[var(--accent-color)] mb-2 uppercase text-xs tracking-wider">Critical Advice</h4>
                  <p className="text-sm text-[var(--text-secondary)] bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50">
                    Stop applying for Senior/Lead roles. Target Junior or Graduate level positions to bridge your professional experience gap.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-[var(--text-primary)] mb-2 uppercase text-xs tracking-wider">Project Advice (Roadmap)</h4>
                  <div className="bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50">
                    <h5 className="font-bold text-sm mb-1">Microservices SaaS Platform</h5>
                    <p className="text-xs text-[var(--text-secondary)]">Build a Python-based microservice integrating Stripe and a PostgreSQL database. Containerize it with Docker.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* State 4: Complete WITHOUT Job Description */}
          {status === "complete_without_jd" && (
            <div className="flex flex-col h-full overflow-y-auto p-8 custom-scrollbar">
              <div className="mb-8 pb-6 border-b border-[var(--border-color)]">
                <h2 className="text-3xl font-black text-[var(--text-primary)]">Profile Analysis</h2>
                <p className="text-[var(--text-secondary)]">No Job Description provided. Evaluating baseline capabilities.</p>
              </div>

              <div className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-6 mb-8 text-center">
                <Globe size={48} className="text-[var(--accent-color)] mx-auto mb-3" />
                <h3 className="text-xl font-black text-[var(--text-primary)] mb-2">Suitable Career Paths</h3>
                <p className="text-sm text-[var(--text-secondary)]">Based on your extracted skills and experience, you are highly competitive for the following roles in the market.</p>
              </div>

              <div className="space-y-4">
                <div className="p-5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl hover:border-[var(--accent-color)] transition-colors cursor-default">
                  <h4 className="font-black text-lg text-[var(--text-primary)]">1. Junior Data Scientist</h4>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Strong alignment with your Python and data analysis background. Market demand is high.</p>
                </div>
                
                <div className="p-5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl hover:border-[var(--accent-color)] transition-colors cursor-default">
                  <h4 className="font-black text-lg text-[var(--text-primary)]">2. Machine Learning Engineer (Entry Level)</h4>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Leverages your academic ML models and internship experience. High growth potential.</p>
                </div>

                <div className="p-5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl hover:border-[var(--accent-color)] transition-colors cursor-default">
                  <h4 className="font-black text-lg text-[var(--text-primary)]">3. Backend Developer (Python)</h4>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">A fallback option utilizing your core programming discipline and cloud tool familiarity.</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}