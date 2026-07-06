import json
import math
from datetime import datetime
from google import genai
from google.genai import types
from app.core.config import settings
from app.schemas.matcher import MatchAnalysisResponse, JobSuggestionResponse, LLMMatchAnalysisInput

def calculate_cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Calculates the cosine similarity between two vectors."""
    dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if not norm_a or not norm_b:
        return 0.0
    return dot_product / (norm_a * norm_b)

def calculate_keyword_score(text_a: str, text_b: str) -> float:
    """
    Calculates deterministic token overlap using the Overlap Coefficient.
    Prevents asymmetric penalization when comparing a short resume section to a long JD.
    """
    stop_words = {
        'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 
        'and', 'any', 'are', "aren't", 'as', 'at', 'be', 'because', 'been', 
        'before', 'being', 'below', 'between', 'both', 'but', 'by', "can't", 
        'cannot', 'could', "couldn't", 'did', "didn't", 'do', 'does', "doesn't", 
        'doing', "don't", 'down', 'during', 'each', 'few', 'for', 'from', 
        'further', 'had', "hadn't", 'has', "hasn't", 'have', "haven't", 'having', 
        'he', "he'd", "he'll", "he's", 'her', 'here', "here's", 'hers', 'herself', 
        'him', 'himself', 'his', 'how', "how's", 'i', "i'd", "i'll", "i'm", 
        "i've", 'if', 'in', 'into', 'is', "isn't", 'it', "it's", 'its', 'itself', 
        "let's", 'me', 'more', 'most', "mustn't", 'my', 'myself', 'no', 'nor', 
        'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 
        'ours', 'ourselves', 'out', 'over', 'own', 'same', "shan't", 'she', 
        "she'd", "she'll", "she's", 'should', "shouldn't", 'so', 'some', 'such', 
        'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves', 
        'then', 'there', "there's", 'these', 'they', "they'd", "they'll", 
        "they're", "they've", 'this', 'those', 'through', 'to', 'too', 'under', 
        'until', 'up', 'very', 'was', "wasn't", 'we', "we'd", "we'll", "we're", 
        "we've", 'were', "weren't", 'what', "what's", 'when', "when's", 'where', 
        "where's", 'which', 'while', 'who', "who's", 'whom', 'why', "why's", 
        'with', "won't", 'would', "wouldn't", 'you', "you'd", "you'll", "you're", 
        "you've", 'your', 'yours', 'yourself', 'yourselves'
    }
    
    
    def tokenize(text: str) -> set[str]:
        # Strip structural punctuation, but keep periods for tech stacks like 'React.js'
        words = text.lower().replace(",", " ").replace("(", " ").replace(")", " ").replace("-", " ").split()
        return {w for w in words if w not in stop_words and len(w) > 1}

    set_a = tokenize(text_a)
    set_b = tokenize(text_b)
    
    if not set_a or not set_b:
        return 0.0
        
    intersection = set_a.intersection(set_b)
    
    # Overlap Coefficient logic: divide by the smaller set. 
    # If a candidate lists 10 skills and all 10 are in the JD, it's a 100% skill match, 
    # even if the JD asks for 30 things total.
    return len(intersection) / min(len(set_a), len(set_b))

def get_deterministic_match_score(client: genai.Client, resume_data: dict, jd_text: str) -> int:
    """
    Computes a scaled, section-weighted hybrid similarity score.
    """
    skills_list = resume_data.get("skills", [])
    skills_text = " ".join(skills_list) if isinstance(skills_list, list) else str(skills_list)
    
    experience_list = resume_data.get("experience", [])
    exp_text = " ".join([f"{e.get('job_title', '')} {e.get('description', '')}" for e in experience_list]) if isinstance(experience_list, list) else ""
    
    projects_list = resume_data.get("projects", [])
    proj_text = " ".join([f"{p.get('title', '')} {p.get('description', '')}" for p in projects_list]) if isinstance(projects_list, list) else ""
    
    sections = {
        "skills": {"text": skills_text, "weight": 0.50},
        "experience": {"text": exp_text, "weight": 0.30},
        "projects": {"text": proj_text, "weight": 0.20}
    }
    
    final_score = 0.0
    
    for section_name, config in sections.items():
        r_text = config["text"].strip()
        if not r_text:
            continue
            
        # 1. Keyword Score (Overlap Coefficient)
        kw_score = calculate_keyword_score(r_text, jd_text)
        
        # 2. Semantic Score
        try:
            res_embedding = client.models.embed_content(model="text-embedding-004", contents=r_text).embedding.values
            jd_embedding = client.models.embed_content(model="text-embedding-004", contents=jd_text).embedding.values
            raw_semantic = calculate_cosine_similarity(res_embedding, jd_embedding)
            
            # Mathematical Scaling: Cosine similarities natively cluster around 0.4 - 0.8 for text.
            # We map the 0.4 - 1.0 range directly to 0.0 - 1.0 for realistic percentage representation.
            semantic_score = max(0.0, (raw_semantic - 0.4) / (1.0 - 0.4))
        except Exception:
            semantic_score = kw_score 
            
        hybrid_section_score = (0.50 * kw_score) + (0.50 * semantic_score)
        final_score += hybrid_section_score * config["weight"]

    return min(max(int(final_score * 100), 0), 100)


def analyze_fit(resume_data: dict, jd_text: str) -> MatchAnalysisResponse:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    # CRITICAL FIX: Hard-injecting the exact date and enforcing temporal awareness.
    current_date = datetime.now().strftime("%B %d, %Y")
    current_year = datetime.now().year
    
    prompt = f"""
    SYSTEM OVERRIDE: TEMPORAL AWARENESS
    Today's exact date is {current_date}. The current year is {current_year}. 
    You must calculate all experience durations, graduation timelines, and student statuses relative to {current_year}. Do NOT assume it is 2023 or 2024.

    You are a ruthless, analytical ATS engineering layer. 
    1. Cross-reference the candidate's skills against the JD. Output exact matches and missing requirements.
    2. Evaluate if their total months/years of experience (calculated up to {current_year}) meets the JD's minimum requirement.
    3. Strip away all fluff. Provide actionable, brutal truths.

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
                response_schema=LLMMatchAnalysisInput,
                temperature=0.0, # 0.0 forces maximum determinism
            )
        )
        
        llm_data = json.loads(response.text)
        
        # --- THE DETERMINISTIC MATH ENGINE ---
        matched_count = len(llm_data.get("matched_skills", []))
        missing_count = len(llm_data.get("missing_skills", []))
        total_skills = matched_count + missing_count
        
        # Calculate Skill Score (Accounts for 80% of total grade)
        skill_ratio = (matched_count / total_skills) if total_skills > 0 else 0
        base_score = skill_ratio * 80
        
        # Calculate Experience Score (Accounts for 20% of total grade)
        exp_score = 20 if llm_data.get("experience_requirement_met") else 0
        
        final_percentage = int(base_score + exp_score)
        
        # Inject the calculated deterministic score back into the final response
        llm_data["match_percentage"] = final_percentage
        
        return MatchAnalysisResponse.model_validate(llm_data)
        
    except Exception as e:
        raise RuntimeError(f"LLM matching analysis failed: {str(e)}")
        

def generate_job_suggestions(resume_data: dict) -> JobSuggestionResponse:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    current_date = datetime.now().strftime("%B %d, %Y")
    
    prompt = f"""
    You are a ruthless, analytical technical career strategist. 
    Today's actual date is {current_date}. Calculate their timeline accurately based on this date.
    Based on the candidate's parsed resume data, suggest exactly 3 distinct job titles they are highly competitive for.
    For each, provide the nature of the work, how their strengths align, and their current limitations or gaps for that specific path.
    Strip away fluff. Be direct.

    Parsed Resume JSON:
    {json.dumps(resume_data, indent=2)}
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=JobSuggestionResponse,
                temperature=0.4,  
            )
        )
        return JobSuggestionResponse.model_validate_json(response.text)
    except Exception as e:
        raise RuntimeError(f"LLM job suggestion failed: {str(e)}")