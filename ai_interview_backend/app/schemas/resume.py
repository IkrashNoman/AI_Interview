from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional

class PersonalInfo(BaseModel):
    model_config = ConfigDict(extra='ignore')
    name: Optional[str] = Field(default=None, description="The full name of the candidate.")
    email: Optional[EmailStr] = Field(default=None, description="The validated email address of the candidate.")
    phone: Optional[str] = Field(default=None, description="The phone number or contact number.")

class Education(BaseModel):
    model_config = ConfigDict(extra='ignore')
    institution: Optional[str] = Field(default=None, description="The name of the university, college, or school.")
    degree: Optional[str] = Field(default=None, description="The degree or certification obtained.")
    start_year: Optional[str] = Field(default=None, description="The start year or date of the education.")
    end_year: Optional[str] = Field(default=None, description="The graduation year or date.")

class Experience(BaseModel):
    model_config = ConfigDict(extra='ignore')
    company: Optional[str] = Field(default=None, description="The name of the company or organization.")
    job_title: Optional[str] = Field(default=None, description="The job title or role held.")
    start_date: Optional[str] = Field(default=None, description="The starting date of employment.")
    end_date: Optional[str] = Field(default=None, description="The ending date of employment.")
    skills_utilized: List[str] = Field(default=[], description="List of technical skills used.")
    description: Optional[str] = Field(default=None, description="A brief summary of responsibilities.")

class Project(BaseModel):
    model_config = ConfigDict(extra='ignore')
    title: Optional[str] = Field(default=None, description="The name of the project.")
    description: Optional[str] = Field(default=None, description="A brief summary of the project.")
    technologies_used: List[str] = Field(default=[], description="Languages, libraries, or tools used.")

class ResumeSchema(BaseModel):
    model_config = ConfigDict(extra='ignore')
    personal_info: Optional[PersonalInfo] = Field(default_factory=PersonalInfo)
    career_objective: Optional[str] = Field(default=None, description="The career objective statement.")
    skills: List[str] = Field(default=[], description="General technical skills listed.")
    education: List[Education] = Field(default=[])
    experience: List[Experience] = Field(default=[])
    projects: List[Project] = Field(default=[])