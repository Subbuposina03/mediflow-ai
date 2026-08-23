import os
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

class Settings(BaseSettings):
    PROJECT_NAME: str = "MediFlow AI"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "supersecretkeyformediflowaiproductionenvironment"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    FRONTEND_URL: str = "http://localhost:5173"
    HOSPITAL_NAME: str = "MediFlow AI"

    
    # Database (No hardcoded credentials)
    MYSQL_SERVER: Optional[str] = None
    MYSQL_USER: Optional[str] = None
    MYSQL_PASSWORD: Optional[str] = None
    MYSQL_DB: Optional[str] = None
    MYSQL_PORT: str = "3306"
    
    # Defaults to True for simple local startup without MySQL
    USE_SQLITE: bool = True

    # AI Service Keys
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    
    @property
    def DATABASE_URL(self) -> str:
        if self.USE_SQLITE or not all([self.MYSQL_SERVER, self.MYSQL_USER, self.MYSQL_PASSWORD, self.MYSQL_DB]):
            return "sqlite:///./mediflow.db"
        return f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}@{self.MYSQL_SERVER}:{self.MYSQL_PORT}/{self.MYSQL_DB}"

    class Config:
        env_file = str(ENV_FILE) if ENV_FILE.exists() else ".env"
        case_sensitive = True
        extra = "ignore"

settings = Settings()
