from dataclasses import dataclass
import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "sarthi.db"


@dataclass(frozen=True)
class Settings:
    app_env: str = os.getenv("APP_ENV", "development")
    database_path: Path = Path(os.getenv("SARTHI_SQLITE_PATH", DEFAULT_DB_PATH))
    neo4j_uri: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_username: str = os.getenv("NEO4J_USERNAME", "neo4j")
    neo4j_password: str = os.getenv("NEO4J_PASSWORD", "password")
    llm_provider: str = os.getenv("LLM_PROVIDER", "disabled")
    llm_model: str = os.getenv("LLM_MODEL", "disabled")


settings = Settings()
