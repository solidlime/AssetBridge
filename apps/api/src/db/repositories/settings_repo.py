from sqlalchemy.orm import Session
from ..models import AppSettings

# LLM に渡すデフォルトのシステムプロンプト。DB に値がない場合に使用される。
DEFAULT_SYSTEM_PROMPT = """あなたはポートフォリオ管理AIアシスタントです。
ユーザーの資産状況を分析し、簡潔で実用的なコメントを日本語で提供してください。
数字には必ず「¥」「%」等の単位を付け、読みやすく整形してください。"""


class AppSettingsRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, key: str) -> str | None:
        """指定したキーの値を返す。存在しない場合は None を返す。"""
        row = self.db.query(AppSettings).filter(AppSettings.key == key).first()
        return row.value if row else None

    def set(self, key: str, value: str) -> None:
        """指定したキーに値を保存する。既存レコードがあれば上書き、なければ新規作成する。"""
        row = self.db.query(AppSettings).filter(AppSettings.key == key).first()
        if row:
            row.value = value
        else:
            row = AppSettings(key=key, value=value)
            self.db.add(row)
        self.db.commit()

    def get_system_prompt(self) -> str:
        """LLM のシステムプロンプトを返す。DB に未設定の場合はデフォルト値を返す。"""
        return self.get("system_prompt") or DEFAULT_SYSTEM_PROMPT

    def set_system_prompt(self, prompt: str) -> None:
        """LLM のシステムプロンプトを保存する。"""
        self.set("system_prompt", prompt)

    def get_scrape_schedule(self) -> dict:
        """スクレイプスケジュール（時・分）を返す。DB 未設定の場合は毎日 6:00 JST をデフォルトとする。"""
        return {
            "hour": int(self.get("scrape_hour") or "6"),
            "minute": int(self.get("scrape_minute") or "0"),
        }

    def set_scrape_schedule(self, hour: int, minute: int) -> None:
        """スクレイプスケジュール（時・分）を保存する。"""
        self.set("scrape_hour", str(hour))
        self.set("scrape_minute", str(minute))

    def get_ai_comment_ttl_hours(self) -> int:
        """AI コメントキャッシュの TTL（時間）を返す。DB 未設定の場合は 6 を返す。"""
        return int(self.get("ai_comment_ttl_hours") or "6")

    def set_ai_comment_ttl_hours(self, hours: int) -> None:
        """AI コメントキャッシュの TTL（時間）を保存する。"""
        self.set("ai_comment_ttl_hours", str(hours))

    # --- Discord Bot 設定 ---

    def get_discord_token(self) -> str:
        """Discord Bot トークンを返す。未設定の場合は空文字を返す。"""
        return self.get("discord_token") or ""

    def set_discord_token(self, token: str) -> None:
        """Discord Bot トークンを保存する。"""
        self.set("discord_token", token)

    def get_discord_channel_id(self) -> str:
        """通知先の Discord チャンネル ID を返す。未設定の場合は空文字を返す。"""
        return self.get("discord_channel_id") or ""

    def set_discord_channel_id(self, channel_id: str) -> None:
        """通知先の Discord チャンネル ID を保存する。"""
        self.set("discord_channel_id", channel_id)

    # --- MCP Server 設定 ---

    def get_mcp_host(self) -> str:
        """MCP サーバーのバインドアドレスを返す。未設定の場合は '0.0.0.0' を返す。"""
        return self.get("mcp_host") or "0.0.0.0"

    def get_mcp_port(self) -> int:
        """MCP サーバーのポート番号を返す。未設定の場合は 8001 を返す。"""
        return int(self.get("mcp_port") or "8001")

    def set_mcp_settings(self, host: str, port: int) -> None:
        """MCP サーバーの host / port を保存する。"""
        self.set("mcp_host", host)
        self.set("mcp_port", str(port))

    # --- LLM 設定 ---

    def get_llm_model(self) -> str:
        """使用する LLM モデル名を返す。未設定の場合は空文字を返す。"""
        return self.get("llm_model") or ""

    def set_llm_model(self, model: str) -> None:
        """使用する LLM モデル名を保存する。"""
        self.set("llm_model", model)

    def get_llm_api_key(self, provider: str) -> str:
        """指定プロバイダーの API キーを返す。provider: anthropic | openai | gemini | openrouter"""
        return self.get(f"llm_key_{provider}") or ""

    def set_llm_api_key(self, provider: str, key: str) -> None:
        """指定プロバイダーの API キーを保存する。provider: anthropic | openai | gemini | openrouter"""
        self.set(f"llm_key_{provider}", key)
