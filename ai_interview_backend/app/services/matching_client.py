import json
from google import genai
from google.genai import types
from app.core.config import settings
from app.schemas.matcher import MatchAnalysisResponse

def analyze_fit(resume_data: dict, jd_text: str) -> MatchAnalysisResponse:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    prompt = f"""
    You are a ruthless, analytical ATS (Applicant Tracking System) matching engine. 
    Your objective is to critically evaluate a candidate's parsed resume against a raw Job Description.
    Strip away all fluff. If the candidate is weak in an area, expose it immediately. 
    Prioritize the reality of the market over comfortable lies.

    Parsed Resume JSON:
    {json.dumps(resume_data, indent=2)}

    Raw Job Description:
    {jd_text}
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=MatchAnalysisResponse,
                temperature=0.2,  # Low temperature for analytical consistency
            )
        )
        return MatchAnalysisResponse.model_validate_json(response.text)
    except Exception as e:
        raise RuntimeError(f"LLM matching analysis failed: {str(e)}")