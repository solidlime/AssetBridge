from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from cryptography.fernet import Fernet
from pathlib import Path
import secrets

# 機密ファイルはプロジェクト外のホームディレクトリに隔離
# ~/.assetbridge/.env.secrets → Claude Code のプロジェクトスコープ外
_SECRETS_PATH = Path.home() / ".assetbridge" / ".env.secrets"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # 優先度: 高 → 低
        # 1. ~/.assetbridge/.env.secrets（機密・プロジェクト外）
        # 2. .env（非機密・プロジェクト内）
        env_file=(str(_SECRETS_PATH), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "sqlite:///./data/assetbridge.db"

    # マネーフォワード for 住信SBI銀行
    MF_EMAIL: str = ""
    MF_PASSWORD: str = ""
    MF_TOTP_SEED: str = ""

    # Discord
    DISCORD_TOKEN: str = ""
    DISCORD_CHANNEL_ID: int = 0

    # LLM
    LLM_MODEL: str = "claude-sonnet-4-6"
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    # 外部データソース
    NEWS_API_KEY: str = ""

    # セキュリティ
    API_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    ENCRYPTION_KEY: str = Field(default_factory=lambda: Fernet.generate_key().decode())

    # サービス設定
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    MCP_HOST: str = "0.0.0.0"
    MCP_PORT: int = 8001
    WEB_PORT: int = 3000


settings = Settings()
