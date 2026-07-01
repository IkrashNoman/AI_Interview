from pydantic import BaseModel, Field
from app.schemas.resume import ResumeSchema

class MatchAnalysisResponse(BaseModel):
    match_percentage: int = Field(..., ge=0, le=100, description="Overall semantic fit from 0 to 100.")
    matched_skills: list[str] = Field(..., description="Skills the user possesses that the JD requires.")
    missing_skills: list[str] = Field(..., description="Skills the JD requires that the user lacks.")
    experience_gap: str = Field(..., description="Analysis of user's years of experience versus JD requirements.")
    job_fit_summary: str = Field(..., description="1-2 sentences summarizing the user's fit for the job based on skills, experience, and other relevant factors.")
    critical_advice: str = Field(..., description="1-2 sentences of brutal, actionable truth on what the user must improve or highlight to get this job.")
    project_advice: str = Field(..., description="1-2 sentences of actionable advice on what projects the user should work on to improve their chances of getting this job.")

class MatchRequest(BaseModel):
    resume_data: ResumeSchema
    job_description_text: str = Field(...,
    title="Job Description",
    description="Paste the full job description here for matching analysis.",
    example="We are looking for a FastAPI developer with Python, PostgreSQL, and Docker experience."
)
    