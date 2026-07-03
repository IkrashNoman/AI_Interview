import json
from google import genai
from google.genai import types
from app.core.config import settings
from app.schemas.roadmap import ProjectRoadmapResponse

def generate_project_roadmap(
    missing_skills: list[str], 
    experience_gap: str, 
    jd_text: str
) -> ProjectRoadmapResponse:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    prompt = f"""
    You are a Senior Staff Engineer and Technical Hiring Manager.
    A candidate wants to apply for the role described in the Job Description below, but our ATS analysis revealed critical gaps in their profile.

    Candidate's Missing Skills:
    {json.dumps(missing_skills, indent=2)}

    Candidate's Experience Gap Analysis:
    {experience_gap}

    Target Job Description:
    {jd_text}

    YOUR MISSION:
    Design a single, rigorous, portfolio-grade technical project that forces the candidate to learn and implement the exact skills they are missing.
    Do NOT suggest generic tutorial apps (no basic TODO lists, no simple CRUD blogs). 
    Design a production-like system or microservice tailored to the engineering domain of the target job description.
    Provide a structured, week-by-week execution roadmap that builds this project from architecture to deployment.
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ProjectRoadmapResponse,
                temperature=0.2,  # Slight creative flexibility for project design while keeping structure strict
            )
        )
        return ProjectRoadmapResponse.model_validate_json(response.text)
    except Exception as e:
        raise RuntimeError(f"LLM project roadmap generation failed: {str(e)}")