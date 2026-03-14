from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator
from cryptography.fernet import Fernet
from pathlib import Path
import secrets
import os

# .env ファイルの解決順序:
#   1. ASSETBRIDGE_ENV_PATH 環境変数（明示的な上書き）
#   2. ~/.assetbridge/.env（本番・デバッグ用の隔離ファイル）
#   3. <プロジェクトルート>/.env（~/.assetbridge/.env が存在しない場合のフォールバック）
_HOME_ENV = Path.home() / ".assetbridge" / ".env"
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
_FALLBACK_ENV = _PROJECT_ROOT / ".env"

_ENV_PATH = Path(
    os.environ.get("ASSETBRIDGE_ENV_PATH")
    or (str(_HOME_ENV) if _HOME_ENV.exists() else str(_FALLBACK_ENV))
)

_DEFAULT_DB_URL = f"sqlite:///{_PROJECT_ROOT.as_posix()}/data/assetbridge.db"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = _DEFAULT_DB_URL

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
    SEARXNG_URL: str = "http://nas:11111"

    # セキュリティ
    API_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    ENCRYPTION_KEY: str = Field(default_factory=lambda: Fernet.generate_key().decode())

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def resolve_database_url(cls, v: str) -> str:
        """sqlite:///./... の相対パスをプロジェクトルート基準の絶対パスに変換する。"""
        if not isinstance(v, str) or not v.startswith("sqlite:///"):
            return v
        path_part = v[len("sqlite:///"):]
        if Path(path_part).is_absolute():
            return v
        # 相対パス（./data/... または data/...）→ 絶対パスへ変換
        rel = path_part.lstrip("./")
        abs_path = (_PROJECT_ROOT / rel).resolve()
        return f"sqlite:///{abs_path.as_posix()}"

    @field_validator("ENCRYPTION_KEY", mode="before")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        """有効な Fernet キーならそのまま使用。無効/空の場合は data/.encryption_key を読み込むか
        新規生成して同ファイルに保存することで、プロセス再起動後も同じキーを使い続ける。
        .env への設定は不要（自動管理の方がセキュリティ上も安全）。"""
        if v:
            try:
                Fernet(v.encode() if isinstance(v, str) else v)
                return v
            except Exception:
                pass  # 無効値 → フォールバックへ

        key_file = _PROJECT_ROOT / "data" / ".encryption_key"
        if key_file.exists():
            stored = key_file.read_text().strip()
            try:
                Fernet(stored.encode())
                return stored
            except Exception:
                pass  # 壊れていたら再生成

        key = Fernet.generate_key().decode()
        key_file.parent.mkdir(parents=True, exist_ok=True)
        key_file.write_text(key)
        return key

    # サービス設定
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    MCP_HOST: str = "0.0.0.0"
    MCP_PORT: int = 8001
    WEB_PORT: int = 3000


settings = Settings()
