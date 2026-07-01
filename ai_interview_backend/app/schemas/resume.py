from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional

class PersonalInfo(BaseModel):
    name: str = Field(description="The full name of the candidate.")
    email: Optional[EmailStr] = Field(default=None, description="The validated email address of the candidate.")
    phone: Optional[str] = Field(default=None, description="The phone number or contact number.")

class Education(BaseModel):
    institution: str = Field(description="The name of the university, college, or school.")
    degree: str = Field(description="The degree or certification obtained (e.g., BS Computer Science).")
    start_year: Optional[str] = Field(default=None, description="The start year or date of the education.")
    end_year: Optional[str] = Field(default=None, description="The graduation year or date. Use 'Present' if ongoing.")

class Experience(BaseModel):
    company: str = Field(description="The name of the company or organization.")
    job_title: str = Field(description="The job title or role held.")
    start_date: Optional[str] = Field(default=None, description="The starting date of employment (e.g., MM/YYYY).")
    end_date: Optional[str] = Field(default=None, description="The ending date of employment. Use 'Present' if currently employed.")
    skills_utilized: List[str] = Field(default=[], description="List of technical skills, tools, or languages explicitly used in this specific role.")
    description: Optional[str] = Field(default=None, description="A brief summary of responsibilities and achievements in this role.")

class Project(BaseModel):
    title: str = Field(description="The name of the project.")
    description: str = Field(description="A brief summary of what the project does and its core features.")
    technologies_used: List[str] = Field(default=[], description="List of programming languages, libraries, frameworks, or tools used to build this project.")

class ResumeSchema(BaseModel):
    personal_info: PersonalInfo = Field(description="The candidate's contact and identifying information.")
    career_objective: Optional[str] = Field(default=None, description="The resume summary or career objective statement.")
    skills: List[str] = Field(default=[], description="A comprehensive list of general technical skills, tools, and languages listed on the resume.")
    education: List[Education] = Field(default=[], description="Chronological history of academic background.")
    experience: List[Experience] = Field(default=[], description="Chronological history of professional or volunteer work experience.")
    projects: List[Project] = Field(default=[], description="List of academic, personal, or open-source projects.")