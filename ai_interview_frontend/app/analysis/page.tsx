"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, CheckCircle, AlertTriangle, Briefcase, GitBranch, Link as LinkIcon, X, PlayCircle, MapPin, Globe, Download, ListTree } from "lucide-react";
import { apiClient } from "../lib/api";

// --- Strict State Interfaces Mapping to Pydantic ---
interface Education { id: string; institution: string; degree: string; start_year: string; end_year: string; }
interface Experience { id: string; company: string; job_title: string; start_date: string; end_date: string; skills_utilized: string | string[]; description: string; }
interface Project { id: string; title: string; description: string; technologies_used: string | string[]; project_link: string; }
interface Language { id: string; language: string; proficiency: string; }

type AnalysisStatus = "idle" | "analyzing" | "complete_with_jd" | "complete_without_jd" | "error";

export default function AnalysisPage() {
  const router = useRouter();
  const isUserLoggedIn = false; 
  const [showAuthModal, setShowAuthModal] = useState(false);

  // --- Section 1: Personal Info ---
  const [personalInfo, setPersonalInfo] = useState({ name: "", phone: "", email: "", linkedin: "", github: "", portfolio: "", other_links: "", location: "", career_objective: "" });

  // --- Dynamic Arrays ---
  const [educations, setEducations] = useState<Education[]>([{ id: "1", institution: "", degree: "", start_year: "", end_year: "" }]);
  const [experiences, setExperiences] = useState<Experience[]>([{ id: "1", company: "", job_title: "", start_date: "", end_date: "", skills_utilized: "", description: "" }]);
  const [projects, setProjects] = useState<Project[]>([{ id: "1", title: "", description: "", technologies_used: "", project_link: "" }]);
  const [languages, setLanguages] = useState<Language[]>([{ id: "1", language: "", proficiency: "" }]);
  const [skills, setSkills] = useState<string[]>([""]);
  
  // --- Job Description ---
  const [jobDescription, setJobDescription] = useState("");

  // --- API Response State ---
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [matchData, setMatchData] = useState<any>(null);
  const [suggestionData, setSuggestionData] = useState<any[]>([]);
  
  // --- Roadmap State ---
  const [roadmapData, setRoadmapData] = useState<any>(null);
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);

  // --- Array Helpers ---
  const generateId = () => Math.random().toString(36).substr(2, 9);
  
  const addEducation = () => setEducations([...educations, { id: generateId(), institution: "", degree: "", start_year: "", end_year: "" }]);
  const removeEducation = (id: string) => educations.length > 1 && setEducations(educations.filter(e => e.id !== id));
  const updateEducation = (id: string, field: keyof Education, value: string) => setEducations(educations.map(e => e.id === id ? { ...e, [field]: value } : e));

  const addExperience = () => setExperiences([...experiences, { id: generateId(), company: "", job_title: "", start_date: "", end_date: "", skills_utilized: "", description: "" }]);
  const removeExperience = (id: string) => experiences.length > 1 && setExperiences(experiences.filter(e => e.id !== id));
  const updateExperience = (id: string, field: keyof Experience, value: string) => setExperiences(experiences.map(e => e.id === id ? { ...e, [field]: value } : e));

  const addProject = () => setProjects([...projects, { id: generateId(), title: "", description: "", technologies_used: "", project_link: "" }]);
  const removeProject = (id: string) => projects.length > 1 && setProjects(projects.filter(p => p.id !== id));
  const updateProject = (id: string, field: keyof Project, value: string) => setProjects(projects.map(p => p.id === id ? { ...p, [field]: value } : p));

  const addLanguage = () => setLanguages([...languages, { id: generateId(), language: "", proficiency: "" }]);
  const removeLanguage = (id: string) => languages.length > 1 && setLanguages(languages.filter(l => l.id !== id));
  const updateLanguage = (id: string, field: keyof Language, value: string) => setLanguages(languages.map(l => l.id === id ? { ...l, [field]: value } : l));

  const addSkill = () => setSkills([...skills, ""]);
  const updateSkill = (index: number, value: string) => { const newSkills = [...skills]; newSkills[index] = value; setSkills(newSkills); };
  const removeSkill = (index: number) => skills.length > 1 && setSkills(skills.filter((_, i) => i !== index));

  // --- Hydration from Session Storage ---
  useEffect(() => {
    const savedData = sessionStorage.getItem("extractedResume");
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.personal_info) {
          setPersonalInfo(prev => ({ 
            ...prev, 
            ...parsed.personal_info,
            other_links: Array.isArray(parsed.personal_info.other_links) ? parsed.personal_info.other_links.join(", ") : parsed.personal_info.other_links || ""
          }));
        }
        if (parsed.career_objective) setPersonalInfo(prev => ({ ...prev, career_objective: parsed.career_objective }));
        if (parsed.skills && Array.isArray(parsed.skills)) setSkills(parsed.skills);
        
        if (parsed.education && Array.isArray(parsed.education) && parsed.education.length > 0) {
          setEducations(parsed.education.map((e: any) => ({ ...e, id: generateId() })));
        }
        if (parsed.experience && Array.isArray(parsed.experience) && parsed.experience.length > 0) {
          setExperiences(parsed.experience.map((e: any) => ({ 
            ...e, id: generateId(), skills_utilized: Array.isArray(e.skills_utilized) ? e.skills_utilized.join(", ") : e.skills_utilized || ""
          })));
        }
        if (parsed.projects && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
          setProjects(parsed.projects.map((p: any) => ({ 
            ...p, id: generateId(), technologies_used: Array.isArray(p.technologies_used) ? p.technologies_used.join(", ") : p.technologies_used || ""
          })));
        }
        if (parsed.languages && Array.isArray(parsed.languages) && parsed.languages.length > 0) {
          setLanguages(parsed.languages.map((l: any) => ({ ...l, id: generateId() })));
        }
      } catch (e) {
        console.error("Failed to parse extracted data.");
      }
    }
  }, []);

  // --- Execution Logic: Core Matching ---
  const runAnalysis = async () => {
    setStatus("analyzing");
    setErrorMessage("");
    setRoadmapData(null); // Reset roadmap on new analysis

    const payload = {
      resume_data: {
        personal_info: { 
          name: personalInfo.name || null, email: personalInfo.email || null, phone: personalInfo.phone || null, 
          linkedin: personalInfo.linkedin || null, github: personalInfo.github || null, portfolio: personalInfo.portfolio || null,
          location: personalInfo.location || null, other_links: personalInfo.other_links ? personalInfo.other_links.split(",").map(s => s.trim()).filter(s => s) : []
        },
        career_objective: personalInfo.career_objective || null,
        skills: skills.filter(s => s.trim() !== ""),
        education: educations.map(({ id, ...rest }) => rest), 
        experience: experiences.map(exp => ({
          company: exp.company || null, job_title: exp.job_title || null, start_date: exp.start_date || null, end_date: exp.end_date || null,
          description: exp.description || null, skills_utilized: typeof exp.skills_utilized === 'string' ? exp.skills_utilized.split(",").map(s => s.trim()).filter(s => s) : exp.skills_utilized
        })),
        projects: projects.map(proj => ({
          title: proj.title || null, description: proj.description || null, project_link: proj.project_link || null,
          technologies_used: typeof proj.technologies_used === 'string' ? proj.technologies_used.split(",").map(s => s.trim()).filter(s => s) : proj.technologies_used
        })),
        languages: languages.map(({ id, ...rest }) => rest)
      },
      job_description_text: jobDescription.trim() === "" ? null : jobDescription
    };

    try {
      const response = await apiClient.post("/api/v1/matcher/match/", payload);
      
      if (response.data.type === "targeted_match") {
        setMatchData(response.data.data);
        setStatus("complete_with_jd");
      } else if (response.data.type === "job_suggestions") {
        setSuggestionData(response.data.data.suggestions);
        setStatus("complete_without_jd");
      }
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.response?.data?.detail || "Failed to connect to the analysis engine.");
      setStatus("error");
    }
  };

  // --- Execution Logic: Roadmap Generation ---
  const generateRoadmap = async () => {
    setIsGeneratingRoadmap(true);
    try {
      const payload = {
        missing_skills: matchData.missing_skills || [],
        experience_gap: matchData.experience_gap || "N/A",
        job_description_text: jobDescription
      };
      
      const response = await apiClient.post("/api/v1/matcher/roadmap", payload);
      setRoadmapData(response.data);
    } catch (error: any) {
      console.error("Roadmap generation failed:", error);
      alert("Failed to generate the execution roadmap.");
    } finally {
      setIsGeneratingRoadmap(false);
    }
  };

  const handleInterviewLaunch = (jobId: string) => {
    if (!isUserLoggedIn) {
      setShowAuthModal(true);
      return;
    }
    router.push(`/interview/${jobId}`);
  };

  const saveAsPDF = () => {
    window.print();
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-8 h-[calc(100vh-80px)] relative print:p-0 print:h-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full print:grid-cols-1 print:block">
        
        {/* ================= LEFT COLUMN: DATA VERIFICATION FORM (HIDDEN ON PRINT) ================= */}
        <div className="flex flex-col h-full overflow-y-auto pr-4 border-r border-[var(--border-color)]/30 custom-scrollbar pb-12 print:hidden">
          
          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
            <h2 className="text-xl font-black mb-4 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Section 1: Personal Info</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="text" value={personalInfo.name || ""} onChange={e => setPersonalInfo({...personalInfo, name: e.target.value})} placeholder="Full Name" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />
              
              <div className="flex bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg overflow-hidden focus-within:border-[var(--accent-color)]">
                <span className="flex items-center justify-center px-3 bg-[var(--border-color)]/20 text-lg" title="Pakistan">🇵🇰</span>
                <input type="tel" value={personalInfo.phone || ""} onChange={e => setPersonalInfo({...personalInfo, phone: e.target.value})} placeholder="Phone Number" className="w-full bg-transparent p-3 text-sm outline-none" />
              </div>
              
              <input type="email" value={personalInfo.email || ""} onChange={e => setPersonalInfo({...personalInfo, email: e.target.value})} placeholder="Email Address" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />
              
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-3.5 text-[var(--text-secondary)]" />
                <input type="text" value={personalInfo.location || ""} onChange={e => setPersonalInfo({...personalInfo, location: e.target.value})} placeholder="Location (City, Country)" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 pl-10 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />
              </div>

              <div className="relative">
                <LinkIcon size={16} className="absolute left-3 top-3.5 text-[var(--text-secondary)]" />
                <input type="url" value={personalInfo.linkedin || ""} onChange={e => setPersonalInfo({...personalInfo, linkedin: e.target.value})} placeholder="LinkedIn URL" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 pl-10 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />
              </div>
              
              <div className="relative">
                <GitBranch size={16} className="absolute left-3 top-3.5 text-[var(--text-secondary)]" />
                <input type="url" value={personalInfo.github || ""} onChange={e => setPersonalInfo({...personalInfo, github: e.target.value})} placeholder="GitHub URL" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 pl-10 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />
              </div>

              <div className="relative">
                <Globe size={16} className="absolute left-3 top-3.5 text-[var(--text-secondary)]" />
                <input type="url" value={personalInfo.portfolio || ""} onChange={e => setPersonalInfo({...personalInfo, portfolio: e.target.value})} placeholder="Portfolio Website URL" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 pl-10 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />
              </div>

              <input type="text" value={personalInfo.other_links || ""} onChange={e => setPersonalInfo({...personalInfo, other_links: e.target.value})} placeholder="Other Links (comma separated)" className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] p-3 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none" />

              <textarea value={personalInfo.career_objective || ""} onChange={e => setPersonalInfo({...personalInfo, career_objective: e.target.value})} placeholder="Career Objective" className="w-full md:col-span-2 h-24 bg-[var(--bg-color)] border border-[var(--border-color)] p-3 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none resize-none" />
            </div>
          </div>

          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
            <h2 className="text-xl font-black mb-4 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Section 2: Education</h2>
            {educations.map((edu) => (
              <div key={edu.id} className="relative mb-4 p-4 border border-[var(--border-color)]/50 rounded-lg bg-[var(--bg-color)]">
                {educations.length > 1 && (
                  <button onClick={() => removeEducation(edu.id)} className="absolute top-3 right-3 text-[var(--text-secondary)] hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <input type="text" value={edu.institution || ""} onChange={e => updateEducation(edu.id, 'institution', e.target.value)} placeholder="Institution" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" value={edu.degree || ""} onChange={e => updateEducation(edu.id, 'degree', e.target.value)} placeholder="Degree" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" value={edu.start_year || ""} onChange={e => updateEducation(edu.id, 'start_year', e.target.value)} placeholder="Start Year" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" value={edu.end_year || ""} onChange={e => updateEducation(edu.id, 'end_year', e.target.value)} placeholder="End Year" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                </div>
              </div>
            ))}
            <button onClick={addEducation} className="flex items-center gap-2 text-sm font-bold text-[var(--accent-color)] hover:opacity-80">
              <Plus size={16} /> Add More Education
            </button>
          </div>

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
                  <input type="text" value={exp.company || ""} onChange={e => updateExperience(exp.id, 'company', e.target.value)} placeholder="Company" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" value={exp.job_title || ""} onChange={e => updateExperience(exp.id, 'job_title', e.target.value)} placeholder="Job Title" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" value={exp.start_date || ""} onChange={e => updateExperience(exp.id, 'start_date', e.target.value)} placeholder="Start Date (e.g. Jun 2023)" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" value={exp.end_date || ""} onChange={e => updateExperience(exp.id, 'end_date', e.target.value)} placeholder="End Date (e.g. Present)" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" value={exp.skills_utilized as string || ""} onChange={e => updateExperience(exp.id, 'skills_utilized', e.target.value)} placeholder="Skills Utilized (comma separated)" className="w-full md:col-span-2 border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <textarea value={exp.description || ""} onChange={e => updateExperience(exp.id, 'description', e.target.value)} placeholder="Description" className="w-full md:col-span-2 h-20 border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent resize-none" />
                </div>
              </div>
            ))}
            <button onClick={addExperience} className="flex items-center gap-2 text-sm font-bold text-[var(--accent-color)] hover:opacity-80">
              <Plus size={16} /> Add More Experience
            </button>
          </div>

          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
            <h2 className="text-xl font-black mb-4 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Section 4: Projects</h2>
            {projects.map((proj) => (
              <div key={proj.id} className="relative mb-4 p-4 border border-[var(--border-color)]/50 rounded-lg bg-[var(--bg-color)]">
                {projects.length > 1 && (
                  <button onClick={() => removeProject(proj.id)} className="absolute top-3 right-3 text-[var(--text-secondary)] hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <input type="text" value={proj.title || ""} onChange={e => updateProject(proj.id, 'title', e.target.value)} placeholder="Project Title" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="url" value={proj.project_link || ""} onChange={e => updateProject(proj.id, 'project_link', e.target.value)} placeholder="Project URL" className="w-full border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <input type="text" value={proj.technologies_used as string || ""} onChange={e => updateProject(proj.id, 'technologies_used', e.target.value)} placeholder="Technology Used (comma separated)" className="w-full md:col-span-2 border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent" />
                  <textarea value={proj.description || ""} onChange={e => updateProject(proj.id, 'description', e.target.value)} placeholder="Project Description" className="w-full md:col-span-2 h-20 border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)] bg-transparent resize-none" />
                </div>
              </div>
            ))}
            <button onClick={addProject} className="flex items-center gap-2 text-sm font-bold text-[var(--accent-color)] hover:opacity-80">
              <Plus size={16} /> Add More Projects
            </button>
          </div>

          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
            <h2 className="text-xl font-black mb-4 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Section 5: Languages</h2>
            {languages.map((lang) => (
              <div key={lang.id} className="relative mb-3 flex gap-3">
                  <input type="text" value={lang.language || ""} onChange={e => updateLanguage(lang.id, 'language', e.target.value)} placeholder="Language (e.g. English)" className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)]" />
                  <input type="text" value={lang.proficiency || ""} onChange={e => updateLanguage(lang.id, 'proficiency', e.target.value)} placeholder="Proficiency (e.g. Fluent)" className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)] p-2 rounded text-sm outline-none focus:border-[var(--accent-color)]" />
                  {languages.length > 1 && (
                    <button onClick={() => removeLanguage(lang.id)} className="p-2 text-[var(--text-secondary)] hover:text-red-500 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  )}
              </div>
            ))}
            <button onClick={addLanguage} className="flex items-center gap-2 mt-2 text-sm font-bold text-[var(--accent-color)] hover:opacity-80">
              <Plus size={16} /> Add Language
            </button>
          </div>

          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6">
            <h2 className="text-xl font-black mb-4 text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">Section 6: Skills</h2>
            <div className="flex flex-wrap gap-3">
              {skills.map((skill, index) => (
                <div key={index} className="flex items-center bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg overflow-hidden focus-within:border-[var(--accent-color)]">
                  <input type="text" value={skill} onChange={(e) => updateSkill(index, e.target.value)} placeholder="Skill" className="p-2 w-32 text-sm bg-transparent outline-none" />
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

          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl p-6 mb-6 shadow-md border-t-4 border-t-[var(--accent-color)]">
            <h2 className="text-xl font-black mb-2 text-[var(--text-primary)]">Section 7: Add Job Description (Optional)</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">Paste the target JD to get a targeted matching score and execution roadmap. Leave blank for general role suggestions.</p>
            <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste Job Description here..." className="w-full h-40 bg-[var(--bg-color)] border border-[var(--border-color)] p-4 rounded-lg text-sm focus:border-[var(--accent-color)] outline-none resize-none" />
          </div>

          <button 
            onClick={runAnalysis}
            disabled={status === "analyzing"}
            className="w-full py-4 bg-[var(--accent-color)] text-[var(--bg-color)] font-black text-lg rounded-xl hover:opacity-90 transition-all uppercase tracking-wide disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg mb-6"
          >
            {status === "analyzing" ? (
              <><Loader2 className="animate-spin" size={24} /> Processing Data...</>
            ) : "Analyze Profile"}
          </button>
        </div>


        {/* ================= RIGHT COLUMN: READ-ONLY ANALYSIS (EXPANDS ON PRINT) ================= */}
        <div className="flex flex-col h-full bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-inner sticky top-24 print:static print:border-none print:shadow-none print:overflow-visible">
          
          {status === "idle" && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center print:hidden">
              <Briefcase size={64} className="text-[var(--border-color)] mb-4 opacity-50" />
              <h3 className="text-2xl font-black text-[var(--text-primary)]">Awaiting Analysis</h3>
              <p className="text-[var(--text-secondary)] mt-2">Verify your parsed data on the left and click analyze to generate your results.</p>
            </div>
          )}

          {status === "analyzing" && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[var(--bg-color)]/50 print:hidden">
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

          {status === "error" && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center print:hidden">
              <AlertTriangle size={64} className="text-red-500 mb-4" />
              <h3 className="text-2xl font-black text-red-500">Analysis Failed</h3>
              <p className="text-[var(--text-secondary)] mt-2">{errorMessage}</p>
            </div>
          )}

          {/* DYNAMIC MATCH RENDERING */}
          {status === "complete_with_jd" && matchData && (
            <div className="flex flex-col h-full overflow-y-auto p-8 custom-scrollbar print:overflow-visible print:p-0">
              
              <div className="flex justify-between items-start mb-8 pb-6 border-b border-[var(--border-color)]">
                <div>
                  <h2 className="text-3xl font-black text-[var(--text-primary)]">Analysis Results</h2>
                  <p className="text-[var(--text-secondary)]">Targeted Evaluation for {personalInfo.name || "Candidate"}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">Match Score</span>
                    <div className={`text-5xl font-black ${matchData.match_percentage >= 75 ? 'text-green-500' : 'text-[var(--accent-color)]'}`}>
                      {matchData.match_percentage}%
                    </div>
                  </div>
                  <button 
                    onClick={saveAsPDF} 
                    className="flex items-center gap-1 text-xs font-bold px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md hover:bg-[var(--border-color)]/20 transition-colors print:hidden"
                  >
                    <Download size={14} /> Save as PDF
                  </button>
                </div>
              </div>

              <div className="space-y-6 flex-grow">
                <div>
                  <h4 className="font-bold text-[var(--text-primary)] mb-2 uppercase text-xs tracking-wider">Job Fit Summary</h4>
                  <p className="text-sm text-[var(--text-secondary)] bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50">
                    {matchData.job_fit_summary}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50 border-l-4 border-l-[var(--text-primary)]">
                    <h4 className="font-bold text-[var(--text-primary)] mb-2">Matched Skills</h4>
                    <ul className="list-disc pl-4 text-sm text-[var(--text-secondary)]">
                      {matchData.matched_skills?.map((skill: string, i: number) => <li key={i}>{skill}</li>)}
                    </ul>
                  </div>
                  <div className="bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50 border-l-4 border-l-[var(--text-secondary)]">
                    <h4 className="font-bold text-[var(--text-primary)] mb-2">Missing Skills</h4>
                    <ul className="list-disc pl-4 text-sm text-[var(--text-secondary)]">
                      {matchData.missing_skills?.length > 0 ? matchData.missing_skills.map((skill: string, i: number) => <li key={i}>{skill}</li>) : <li>None identified</li>}
                    </ul>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-[var(--text-primary)] mb-2 uppercase text-xs tracking-wider">Experience Level</h4>
                  <p className="text-sm text-[var(--text-secondary)] bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50">
                    {matchData.experience_gap}
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-[var(--text-primary)] mb-2 uppercase text-xs tracking-wider">Actionable Advice</h4>
                  <div className="bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50 border-l-4 border-l-[var(--accent-color)]">
                    <p className="text-sm text-[var(--text-secondary)] mb-2"><strong className="text-[var(--text-primary)]">Critical Priority:</strong> {matchData.critical_advice}</p>
                    <p className="text-sm text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">Project Directive:</strong> {matchData.project_advice}</p>
                  </div>
                </div>
                
                {/* --- ROADMAP INJECTION SECTION --- */}
                <div className="mt-8 pt-6 border-t border-[var(--border-color)]">
                  {!roadmapData ? (
                    <div className="flex flex-col items-center bg-[var(--bg-color)] p-6 rounded-xl border border-[var(--border-color)]/50 text-center print:hidden">
                      <ListTree size={32} className="text-[var(--accent-color)] mb-3" />
                      <h4 className="font-bold text-[var(--text-primary)] mb-2">Execution Roadmap</h4>
                      <p className="text-sm text-[var(--text-secondary)] mb-4">Generate a week-by-week technical blueprint to build the required skills.</p>
                      <button 
                        onClick={generateRoadmap}
                        disabled={isGeneratingRoadmap}
                        className="px-6 py-3 bg-[var(--text-primary)] text-[var(--bg-color)] font-bold text-sm rounded-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isGeneratingRoadmap ? <><Loader2 className="animate-spin" size={16} /> Architecting Plan...</> : "Generate Execution Roadmap"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <div className="mb-6">
                        <h3 className="text-2xl font-black text-[var(--text-primary)] mb-2">{roadmapData.project_title}</h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-4 italic">{roadmapData.problem_statement}</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {roadmapData.tech_stack.map((tech: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-[var(--accent-color)]/10 text-[var(--accent-color)] text-xs font-bold rounded-md border border-[var(--accent-color)]/30">
                              {tech}
                            </span>
                          ))}
                        </div>
                        <p className="text-sm text-[var(--text-primary)] bg-[var(--bg-color)] p-4 rounded-lg border border-[var(--border-color)]/50">
                          <strong>Why build this:</strong> {roadmapData.why_this_project_works}
                        </p>
                      </div>

                      <div className="relative border-l-2 border-[var(--border-color)] ml-3 space-y-8 mt-4">
                        {roadmapData.milestones.map((milestone: any, i: number) => (
                          <div key={i} className="relative pl-6">
                            <div className="absolute -left-[9px] top-1 w-4 h-4 bg-[var(--bg-color)] border-2 border-[var(--accent-color)] rounded-full"></div>
                            <h4 className="font-bold text-[var(--text-primary)] text-md">Week {milestone.week_number}: {milestone.title}</h4>
                            <p className="text-sm text-[var(--text-secondary)] mt-1 mb-2">{milestone.technical_objective}</p>
                            <div className="bg-[var(--bg-color)] p-3 rounded-md border border-[var(--border-color)]/50">
                              <p className="text-xs text-[var(--text-primary)]"><strong>Deliverable:</strong> {milestone.key_deliverable}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom CTA */}
              <div className="mt-8 pt-6 border-t border-[var(--border-color)] print:hidden">
                {matchData.match_percentage >= 75 ? (
                  <div className="flex flex-col items-center text-center">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle size={24} className="text-green-500" />
                      <h3 className="text-xl font-black text-[var(--text-primary)]">High Fit Detected</h3>
                    </div>
                    <p className="text-[var(--text-secondary)] text-sm mb-6">Your profile strongly aligns with this position. Do you want to improve with a Mock Interview?</p>
                    <button onClick={() => handleInterviewLaunch("targeted-match-id")} className="px-8 py-4 bg-green-600 text-white font-black uppercase tracking-wide text-sm rounded-xl shadow-md hover:bg-green-700 transition-colors w-full flex items-center justify-center gap-2">
                      <PlayCircle size={20} /> Apply For Interview
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={24} className="text-red-500" />
                      <h3 className="text-xl font-black text-[var(--text-primary)]">Critical Mismatch</h3>
                    </div>
                    <p className="text-[var(--text-primary)] font-bold text-sm mb-1">You are not an immediate fit for this job.</p>
                    <p className="text-sm text-[var(--text-secondary)] mb-6">Complete the execution roadmap above to bridge your skill gap before applying.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DYNAMIC SUGGESTIONS RENDERING */}
          {status === "complete_without_jd" && suggestionData && (
            <div className="flex flex-col h-full overflow-y-auto p-8 custom-scrollbar print:overflow-visible print:p-0">
              <div className="flex justify-between items-start mb-6 pb-6 border-b border-[var(--border-color)]">
                <div>
                  <h2 className="text-3xl font-black text-[var(--text-primary)]">Profile Analysis</h2>
                  <p className="text-[var(--text-secondary)] mt-2">Competitive market roles based on your extracted skills.</p>
                </div>
                <button 
                  onClick={saveAsPDF} 
                  className="flex items-center gap-1 text-xs font-bold px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md hover:bg-[var(--border-color)]/20 transition-colors print:hidden"
                >
                  <Download size={14} /> Save as PDF
                </button>
              </div>

              <div className="space-y-4">
                {suggestionData.map((job: any, index: number) => (
                  <div 
                    key={index}
                    className="w-full text-left p-5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-black text-lg text-[var(--text-primary)]">{index + 1}. {job.title}</h4>
                      <button onClick={() => handleInterviewLaunch(`suggested-role-${index}`)} className="text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors print:hidden">
                        <PlayCircle size={20} />
                      </button>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mb-2"><strong className="text-[var(--text-primary)]">Role:</strong> {job.description}</p>
                    <p className="text-xs text-[var(--text-secondary)] mb-2"><strong className="text-green-500">Alignment:</strong> {job.strengths_alignment}</p>
                    <p className="text-xs text-[var(--text-secondary)]"><strong className="text-red-500">Gap:</strong> {job.current_limitations}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {showAuthModal && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 px-4 rounded-xl print:hidden">
          <div className="bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-black mb-2 text-[var(--text-primary)]">Authentication Required</h2>
            <p className="text-[var(--text-secondary)] mb-6">
              You must be signed in to launch a mock interview and track your performance metrics.
            </p>
            
            <div className="flex flex-col gap-3">
              <button onClick={() => router.push("/register")} className="w-full py-3 bg-[var(--accent-color)] text-[var(--bg-color)] font-bold rounded-xl hover:opacity-90 transition-all">
                Register Now
              </button>
              <button onClick={() => router.push("/login")} className="w-full py-3 bg-[var(--bg-color)] text-[var(--text-primary)] border border-[var(--border-color)] font-bold rounded-xl hover:border-[var(--text-primary)] transition-all">
                Login
              </button>
              <button onClick={() => setShowAuthModal(false)} className="w-full py-3 text-[var(--text-secondary)] font-bold hover:text-[var(--text-primary)] transition-all mt-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}