import uuid
from google import genai
from google.genai import types
from app.schemas.interview import InterviewBlueprintResponse
from app.core.config import settings

# Initialize the Gemini client. Ensure GEMINI_API_KEY is in your .env
client = genai.Client(api_key=settings.GEMINI_API_KEY)

def generate_interview_blueprint(job_description: str, parsed_resume: dict) -> InterviewBlueprintResponse:
    """
    Generates a deterministic 15-question interview blueprint based on the JD and Resume.
    """
    
    system_instruction = """
        You are an expert interviewer.

        Your task is to generate EXACTLY 15 personalized interview questions using ONLY:
        1. The candidate's resume.
        2. The target job description.

        Never invent or assume experience that is not supported by the provided resume or job description.

        First, infer:
        - The role being applied for.
        - The candidate's seniority.
        - The key skills and responsibilities required for the role.

        Then adapt the interview accordingly. The interview should be challenging but fair for the candidate's experience level and relevant to the target role, whether it is technical, non-technical, or a combination of both.

        Structure the interview as follows:

        Stage 1 (Questions 1–2): Resume Verification
        - Verify resume authenticity.
        - Ask about projects, responsibilities, achievements, timelines, and measurable impact.
        - Require concrete examples.

        Stage 2 (Questions 3–5): Motivation & Core Competencies
        - Understand career goals and motivation.
        - Evaluate the candidate's understanding of the fundamental skills required for the role.

        Stage 3 (Questions 6–11): Role-Specific Evaluation
        - Focus on the responsibilities, skills, and requirements from the job description.
        - Ask practical, scenario-based questions.
        - Explore implementation, decision-making, problem-solving, trade-offs, challenges, and lessons learned.
        - Whenever possible, reference experiences and skills found in both the resume and job description.

        Stage 4 (Questions 12–13): Advanced Role Scenarios
        - Present realistic scenarios appropriate for the role and the candidate's experience level.
        - For technical roles, this may include architecture, debugging, design, scalability, security, or engineering decisions.
        - For non-technical roles, this may include strategy, stakeholder management, communication, leadership, customer interactions, operations, planning, analysis, or decision-making.
        - Adapt the complexity to the candidate's seniority.

        Stage 5 (Questions 14–15): Behavioral & Collaboration
        - Evaluate ownership, communication, teamwork, adaptability, prioritization, conflict resolution, learning, leadership, and decision-making.
        - Personalize these questions using the candidate's resume whenever possible.

        Rules:
        - Generate EXACTLY 15 questions.
        - Personalize every question whenever possible.
        - Do not ask generic questions if a resume-specific question can be asked instead.
        - Never invent projects, employers, technologies, achievements, or responsibilities.
        - If information is limited, ask exploratory follow-up questions instead of making assumptions.
        - Return only the response defined by the provided response schema.
    """
    
    prompt = f"""
    TARGET JOB DESCRIPTION:
    {job_description}
    
    CANDIDATE RESUME JSON:
    {parsed_resume}
    """
    
    try:
        # We use Gemini 2.5 Flash for high-speed, structured cognitive extraction
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=InterviewBlueprintResponse,
                temperature=0.2, # Low temperature to prevent hallucinated formats
            ),
        )
        
        # Parse the structured response into our Pydantic model
        blueprint = InterviewBlueprintResponse.model_validate_json(response.text)
        
        # Inject a unique session ID for state management
        blueprint.session_id = str(uuid.uuid4())
        
        return blueprint
        
    except Exception as e:
        # In production, log this error properly before raising
        raise RuntimeError(f"Failed to generate interview blueprint: {str(e)}")