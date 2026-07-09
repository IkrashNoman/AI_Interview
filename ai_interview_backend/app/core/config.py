from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Safe to hardcode: Application metadata
    PROJECT_NAME: str
    
    # Secrets & Configuration: Type declarations only.
    # Pydantic will pull the actual values directly from your .env file.
    # If these are missing from .env, the application will refuse to start.
    GEMINI_API_KEY: str
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    # Instruction for Pydantic to load variables from the .env file
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

# Instantiate the settings object
settings = Settings()