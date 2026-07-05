from fastapi import APIRouter, HTTPException
from app.schemas.matcher import MatchRequest

# Import your existing service function AND your new suggestion function
# (Ensure you actually created 'generate_job_suggestions' in matching_client.py)
from app.services.matching_client import analyze_fit, generate_job_suggestions

router = APIRouter()

@router.post("/match/")
async def match_resume_to_jd(request: MatchRequest):
    try:
        # Convert the Pydantic resume model to a Python dictionary for the AI service
        resume_dict = request.resume_data.model_dump()
        
        # Branch 1: Job Description IS provided -> Targeted Match
        if request.job_description_text and request.job_description_text.strip():
            analysis = analyze_fit(resume_dict, request.job_description_text)
            return {
                "type": "targeted_match",
                "data": analysis
            }
        else:
            suggestions = generate_job_suggestions(resume_dict)
            return {
                "type": "job_suggestions",
                "data": suggestions
            }
            
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during the matching process: {str(e)}")