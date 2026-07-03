from pydantic import BaseModel, Field

# --- Response Models (What the LLM outputs) ---
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

# --- Request Model (What the client sends to your API) ---
class RoadmapRequest(BaseModel):
    missing_skills: list[str] = Field(..., description="The array of missing skills identified by the matcher.")
    experience_gap: str = Field(..., description="The experience gap string identified by the matcher.")
    job_description_text: str = Field(..., description="The raw text of the target job description.")