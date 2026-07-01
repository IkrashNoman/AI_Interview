from fastapi import APIRouter, HTTPException
from app.schemas.matcher import MatchRequest, MatchAnalysisResponse
from app.services.matching_client import analyze_fit

router = APIRouter()

@router.post("/match/", response_model=MatchAnalysisResponse)
async def match_resume_to_jd(request: MatchRequest):
    try:
        resume_dict = request.resume_data.model_dump()
        analysis = analyze_fit(resume_dict, request.job_description_text)
        return analysis
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="An unexpected error occurred during the matching process.")