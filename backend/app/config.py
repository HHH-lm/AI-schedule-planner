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

    # 用户自备 Key 模式：请求未带 provider 时才回退此值（限 openai/deepseek/local）；
    # 服务端 OPENAI/DEEPSEEK_API_KEY 仅供 golden 评测链路使用，不服务用户请求
    ai_provider: str = "local"
    ai_timeout_ms: int = 15000

    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    deepseek_api_key: str | None = None
    deepseek_model: str = "deepseek-flash"
    deepseek_base_url: str = "https://api.deepseek.com"
    # DeepSeek thinking 开关（disabled/enabled）。解析类任务关思考换速度：
    # thinking 模式下 effort 默认 high 且思考与正文共享输出预算，实测 97% 输出 token 花在思考
    deepseek_thinking: str = "disabled"

    # 语音转文字（语音输入）：服务端统一 Key，前端录音后上传，后端转发到 SiliconFlow。
    # 模型 ID 不硬编码进业务逻辑，便于按上游表现切换。
    # 默认 TeleSpeechASR 而非 SenseVoiceSmall：2026-09-16 实测同音频交替对照，
    # SenseVoiceSmall 延迟 0.6~31 秒剧烈波动（多次触顶 30 秒超时），
    # TeleSpeechASR 稳定在 0.2~1.6 秒且中文识别结果相当（含「3点」→「三点」口语化还原）。
    # 两者均免费；如需换回 SenseVoice 只改本环境变量。响应体只有 text，无时长/分段。
    siliconflow_api_key: str | None = None
    siliconflow_base_url: str = "https://api.siliconflow.cn/v1"
    siliconflow_asr_model: str = "TeleAI/TeleSpeechASR"
    # 上传音频 + 识别的总预算：比解析类端点宽松（前端默认 15s 不含上传体积）
    asr_timeout_ms: int = 30000
    # 录音上限：前端按 16kHz 单声道 WAV 上传，60s 约 1.9MB，同时守住 Vercel 请求体上限
    max_audio_seconds: int = 60
    max_audio_bytes: int = 8 * 1024 * 1024

    max_parse_input_length: int = 2000
    max_schedules: int = 20
    # thinking 模式下思考与正文共享该输出预算：过小会让思考耗尽预算、正文为空（finish_reason=length）
    max_output_tokens: int = 8000

    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    reminder_scan_seconds: int = 300
    timezone: str = "Asia/Shanghai"
    enable_scheduler: bool = True
    cron_secret: str | None = None
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    wechat_push_type: str = "none"
    wecom_webhook_url: str | None = None
    pushplus_token: str | None = None
    serverchan_key: str | None = None

    # Axiom 日志直发（Hobby 版 Vercel 无 Log Drain，应用内直发替代）：
    # 未配置 token/dataset 时自动禁用；LOG_SHIP_ENABLED 可作紧急停发开关。
    # ingest 接口走边缘部署域名（api.axiom.co 仅承担管理类接口），SDK 默认 US East 1；
    # 组织所在区在 Axiom Settings → General → Edge deployment 查看（欧区为
    # eu-central-1.aws.edge.axiom.co）
    axiom_api_url: str = "https://us-east-1.aws.edge.axiom.co"
    axiom_api_token: str | None = None
    axiom_dataset: str | None = None
    log_ship_enabled: bool = True
    log_ship_timeout_seconds: float = 2.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
