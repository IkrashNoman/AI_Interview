from pydantic import BaseModel, Field
from typing import List
from app.schemas.resume import ResumeSchema

class TargetQuestion(BaseModel):
    id: int = Field(..., description="Sequential number from 1 to 15.")
    stage: str = Field(..., description="Stage name (e.g., 'STAGE 3: JD Alignment').")
    category: str = Field(..., description="Topic focus: 'Verification', 'Core Foundation', 'Technical Deep Dive', 'System Design', or 'Behavioral'.")
    difficulty: str = Field(..., description="Easy, Medium, or Hard.")
    question_text: str = Field(..., description="The exact spoken text of the question.")
    expected_keywords: List[str] = Field(..., description="3-5 core technical terms or concepts required in a correct answer.")

class InterviewBlueprintResponse(BaseModel):
    session_id: str = Field(..., description="Unique identifier for the interview session.")
    total_questions: int = Field(default=15, description="Must always be 15.")
    blueprint: List[TargetQuestion] = Field(..., description="The ordered list of 15 questions.")

# --- 2. Input Schema: What the Frontend Sends to Initialize ---

class InterviewInitializeRequest(BaseModel):
    job_description: str = Field(..., description="Raw text of the target job description.")
    parsed_resume: ResumeSchema = Field(..., description="The structured JSON of the user's resume from Phase 1.")