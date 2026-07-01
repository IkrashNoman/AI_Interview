from app.schemas.resume import ResumeSchema
from app.core.config import settings
from google import genai

# Initialize Gemini client
client = genai.Client(api_key=settings.GEMINI_API_KEY)

def parse_resume_with_llm(resume_text: str) -> ResumeSchema:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"You are an expert ATS data extraction system. Extract the information from the raw resume text precisely into the required schema.\n\nResume:\n{resume_text}",
        config={
            "response_mime_type": "application/json",
            "response_schema": ResumeSchema, # This forces the LLM to output valid JSON matching your schema
        }
    )

    # The SDK automatically validates the JSON and returns the instantiated Pydantic object natively
    return response.parsed