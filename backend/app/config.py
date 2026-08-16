from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """服务端配置，优先读取项目根目录的 .env.local / .env。"""

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env.local", PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    service_name: str = "ai-schedule-backend"
    version: str = "0.1.0"

    log_level: str = "INFO"
    log_format: str = "json"

    ai_provider: str = "auto"
    ai_timeout_ms: int = 15000

    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    deepseek_api_key: str | None = None
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"

    max_parse_input_length: int = 2000
    max_schedules: int = 20
    max_output_tokens: int = 1000

    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    reminder_scan_seconds: int = 300
    timezone: str = "Asia/Shanghai"

    wechat_push_type: str = "none"
    wecom_webhook_url: str | None = None
    pushplus_token: str | None = None
    serverchan_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
