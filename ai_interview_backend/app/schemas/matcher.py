from pydantic import BaseModel, Field
from typing import List, Optional
from app.schemas.resume import ResumeSchema

# --- 1. The Input Schema ---
class MatchRequest(BaseModel):
    resume_data: ResumeSchema
    # CRITICAL FIX: This must be Optional, or the "No JD" flow will crash.
    job_description_text: Optional[str] = Field(
        default=None,
        title="Job Description",
        description="Paste the full job description here for matching analysis. If empty, system returns general job suggestions."
    )

# --- 2. Output Schema: When JD IS Provided (Your Code) ---
class MatchAnalysisResponse(BaseModel):
    match_percentage: int = Field(..., ge=0, le=100, description="Overall semantic fit from 0 to 100.")
    matched_skills: list[str] = Field(..., description="Skills the user possesses that the JD requires.")
    missing_skills: list[str] = Field(..., description="Skills the JD requires that the user lacks.")
    experience_gap: str = Field(..., description="Analysis of user's years of experience versus JD requirements.")
    job_fit_summary: str = Field(..., description="1-2 sentences summarizing the user's fit for the job based on skills, experience, and other relevant factors.")
    critical_advice: str = Field(..., description="1-2 sentences of brutal, actionable truth on what the user must improve or highlight to get this job.")
    project_advice: str = Field(..., description="1-2 sentences of actionable advice on what projects the user should work on to improve their chances of getting this job.")

# --- 3. Output Schema: When NO JD is Provided (New Feature) ---
class JobSuggestion(BaseModel):
    title: str
    description: str = Field(description="Nature of work and primary responsibilities.")
    strengths_alignment: str = Field(description="Why the user's specific skills align with this role.")
    current_limitations: str = Field(description="Where the profile falls short for this track currently.")

class JobSuggestionResponse(BaseModel):
    suggestions: List[JobSuggestion] = Field(max_length=3, min_length=3)