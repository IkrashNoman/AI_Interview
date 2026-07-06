from pydantic import BaseModel, Field
from typing import List, Optional
from app.schemas.resume import ResumeSchema

# --- 1. The Input Schema ---
class MatchRequest(BaseModel):
    resume_data: ResumeSchema
    job_description_text: Optional[str] = Field(
        default=None,
        title="Job Description",
        description="Paste the full job description here for matching analysis. If empty, system returns general job suggestions."
    )

# --- 2. Output Schema: What the Frontend Expects ---
class MatchAnalysisResponse(BaseModel):
    match_percentage: int = Field(..., ge=0, le=100, description="Overall deterministic fit from 0 to 100.")
    matched_skills: list[str] = Field(..., description="Skills the user possesses that the JD requires.")
    missing_skills: list[str] = Field(..., description="Skills the JD requires that the user lacks.")
    experience_gap: str = Field(..., description="Analysis of user's years of experience versus JD requirements.")
    job_fit_summary: str = Field(..., description="1-2 sentences summarizing the user's fit for the job.")
    critical_advice: str = Field(..., description="1-2 sentences of brutal, actionable truth on what the user must improve.")
    project_advice: str = Field(..., description="1-2 sentences of actionable advice on what projects the user should work on.")

# --- Internal Schema: What we ask the LLM to generate ---
class LLMMatchAnalysisInput(BaseModel):
    matched_skills: list[str] = Field(..., description="Exact skills the user possesses that the JD explicitly requires.")
    missing_skills: list[str] = Field(..., description="Exact skills the JD requires that the user completely lacks.")
    experience_requirement_met: bool = Field(..., description="True if the candidate's years of experience meet or exceed the JD minimum requirements.")
    experience_gap: str = Field(..., description="Analytical breakdown of user's chronological experience versus JD requirements.")
    job_fit_summary: str = Field(..., description="Strict 1-2 sentences summarizing the overall fit based on empirical data.")
    critical_advice: str = Field(..., description="Strict 1-2 sentences of brutal, actionable truth detailing the exact reason the candidate falls short.")
    project_advice: str = Field(..., description="Strict 1-2 sentences dictating the exact technical project the candidate must build to close the skill gap.")
# --- 3. Output Schema: When NO JD is Provided ---
class JobSuggestion(BaseModel):
    title: str
    description: str = Field(description="Nature of work and primary responsibilities.")
    strengths_alignment: str = Field(description="Why the user's specific skills align with this role.")
    current_limitations: str = Field(description="Where the profile falls short for this track currently.")

class JobSuggestionResponse(BaseModel):
    suggestions: List[JobSuggestion] = Field(max_length=3, min_length=3)

# --- 4. Roadmap Input/Output Schemas ---
class Milestone(BaseModel):
    week_number: int = Field(..., ge=1, le=12, description="The week number for this phase of the project.")
    title: str = Field(..., description="Short, punchy title of the sprint/milestone.")
    technical_objective: str = Field(..., description="The architectural or coding goal to achieve this week.")
    key_deliverable: str = Field(..., description="The exact artifact, PR, feature, or benchmark that proves completion.")
    skills_applied: list[str] = Field(..., description="Specific skills from the user's missing skills list applied during this phase.")

class ProjectRoadmapResponse(BaseModel):
    project_title: str = Field(..., description="Professional, portfolio-ready title for the project.")
    problem_statement: str = Field(..., description="2-3 sentences defining the real-world engineering problem this project solves.")
    tech_stack: list[str] = Field(..., description="Complete list of frameworks, databases, and tools required.")
    why_this_project_works: str = Field(..., description="Brief explanation of how this specific build directly counters the user's experience gap and missing skills.")
    milestones: list[Milestone] = Field(..., description="Chronological, week-by-week execution roadmap.")

class RoadmapRequest(BaseModel):
    missing_skills: list[str] = Field(..., description="The array of missing skills identified by the matcher.")
    experience_gap: str = Field(..., description="The experience gap string identified by the matcher.")
    job_description_text: str = Field(..., description="The raw text of the target job description.")
