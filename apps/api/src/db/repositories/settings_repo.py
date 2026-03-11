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
