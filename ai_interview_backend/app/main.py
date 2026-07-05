from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import parser, matcher

app = FastAPI(
    title="AI Interview Coach API", 
    description="Phase 1: Resume Parsers & Context Engines"
)

# CRITICAL: This allows your Next.js frontend (localhost:3000) to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register your route files here
app.include_router(parser.router, prefix="/api/v1/parser", tags=["Parser"])
app.include_router(matcher.router, prefix="/api/v1/matcher", tags=["Matcher"])

@app.get("/")
def health_check():
    return {"status": "operational", "message": "FastAPI is running."}