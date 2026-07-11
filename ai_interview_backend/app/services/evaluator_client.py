from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from app.core.config import settings

client = genai.Client(api_key=settings.GEMINI_API_KEY)

class AnswerEvaluation(BaseModel):
    structure_feedback: str = Field(..., description="Critique of how the answer was framed.")
    structure_score: int = Field(..., ge=0, le=100)
    correctness_feedback: str = Field(..., description="Critique of technical accuracy.")
    correctness_score: int = Field(..., ge=0, le=100)
    completeness_feedback: str = Field(..., description="Did they answer all parts of the question?")
    completeness_score: int = Field(..., ge=0, le=100)

def evaluate_candidate_answer(question_text: str, expected_keywords: list[str], transcript: str) -> AnswerEvaluation:
    """
    Grades a single interview answer against the expected parameters.
    """
    if not transcript or len(transcript.strip()) < 5:
        # Auto-fail if the transcript is empty or just noise
        return AnswerEvaluation(
            structure_feedback="No coherent audio detected.", structure_score=0,
            correctness_feedback="Answer was empty.", correctness_score=0,
            completeness_feedback="Candidate did not provide a response.", completeness_score=0
        )

    system_instruction = """
    You are an Elite Technical Interview Evaluator.

        Evaluate the candidate's answer as if conducting a senior-level technical interview.

        Rules:
        - Prioritize factual correctness over presentation.
        - Penalize hallucinations, fabricated facts, incorrect terminology, and misleading explanations heavily.
        - Do not reward verbosity unless it adds correct technical value.
        - Reward precise, technically accurate, and well-reasoned answers.
        - Identify missing concepts that are essential for a complete answer.
        - Never invent facts or assume the candidate meant something they did not explicitly state.
        - Judge only the provided answer.

        Scoring Criteria:
        - Correctness
        - Completeness
        - Depth of understanding
        - Technical reasoning
        - Clarity

        Return ONLY a valid JSON object matching the required schema. Do not output any text outside the JSON object.
    """

    prompt = f"""
    INTERVIEW QUESTION: {question_text}
    EXPECTED KEYWORDS/CONCEPTS: {', '.join(expected_keywords)}
    
    CANDIDATE TRANSCRIPT:
    "{transcript}"
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=AnswerEvaluation,
                temperature=0.1,
            ),
        )
        return AnswerEvaluation.model_validate_json(response.text)
    except Exception as e:
        raise RuntimeError(f"Evaluation LLM failed: {str(e)}")