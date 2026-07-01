import traceback

from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.extractor import extract_text_from_file
from app.services.llm_client import parse_resume_with_llm
from app.schemas.resume import ResumeSchema

# 1. Initialize the router
router = APIRouter()

# 2. Use @router.post, NOT @app.post
@router.post("/extract/", response_model=ResumeSchema)
async def extract_resume(file: UploadFile = File(...)):
    ALLOWED_TYPES = [
        "application/pdf", 
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream" 
    ]
    
    if file.content_type not in ALLOWED_TYPES:
        print("filename:", file.filename)
        print("content_type:", file.content_type)
        raise HTTPException(status_code=400, detail="Invalid file type.")
        
    try:
        file_bytes = await file.read()
        raw_text = extract_text_from_file(file_bytes, file.content_type)
        
        if not raw_text:
            raise HTTPException(status_code=422, detail="File is empty or unreadable.")
            
        # The LLM returns a fully validated Pydantic object automatically
        validated_resume = parse_resume_with_llm(raw_text)
        return validated_resume
        
    except Exception as e:
        print("FULL ERROR:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))