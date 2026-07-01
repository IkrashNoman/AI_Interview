from fastapi import FastAPI
from app.api.v1.parser import router as parser_router
from app.api.v1.matcher import router as matcher_router
from app.core.config import settings

# 1. This must match the name Uvicorn is looking for
app = FastAPI(title=settings.PROJECT_NAME)

# 2. Include the router we built in api/v1/parser.py
# This prefixes your endpoint so it lives at http://127.0.0.1:8000/api/v1/extract
app.include_router(parser_router, prefix="/api/v1", tags=["Parser"])
app.include_router(matcher_router, prefix="/api/v1", tags=["Matcher"])

@app.get("/")
async def root():
    return {"status": "healthy", "message": "AI Interview Coach Backend Operational"}