import logging
import secrets
from functools import lru_cache

from pydantic_settings import BaseSettings

logger = logging.getLogger("aventuria.config")

_DEV_SECRET_KEY_SENTINEL = "dev-secret-key-change-in-production"


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./aventuria_vtt.db"
    DATABASE_URL_SYNC: str = "sqlite:///./aventuria_vtt.db"
    REDIS_URL: str = ""  # Empty = use in-memory fallback
    SECRET_KEY: str = _DEV_SECRET_KEY_SENTINEL
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    ANTHROPIC_API_KEY: str = ""
    CORS_ORIGINS: str = "http://localhost:5173"
    ENV: str = "development"  # "development" | "production"
    SEED_TEST_USERS: bool = False  # Seed gm@test.de + 4 player test accounts. Dev-only.

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _validate_secret_key(settings)
    return settings


def _validate_secret_key(settings: Settings) -> None:
    """Refuse to run with the dev-default SECRET_KEY in production.

    JWT tokens are signed with SECRET_KEY. If the dev default ever reaches a
    public deployment, anyone can forge a token and log in as any user. Fail
    fast so misconfiguration is loud rather than silent.
    """
    if settings.SECRET_KEY != _DEV_SECRET_KEY_SENTINEL:
        return

    if settings.ENV.lower() == "production":
        suggestion = secrets.token_urlsafe(48)
        raise RuntimeError(
            "SECRET_KEY is set to the development default in production. "
            "Generate a strong value and set it via the SECRET_KEY env var. "
            f"Suggestion: {suggestion}"
        )

    logger.warning(
        "SECRET_KEY is using the development default. JWTs can be forged by "
        "anyone with this repo. Override SECRET_KEY before exposing this "
        "backend on any network. Generate one with: "
        "python -c 'import secrets; print(secrets.token_urlsafe(48))'"
    )
