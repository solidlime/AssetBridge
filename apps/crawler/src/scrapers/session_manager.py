from cryptography.fernet import Fernet
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional


class SessionManager:
    def __init__(self, scraper_name: str, encryption_key: str | bytes):
        self.path = Path(f"data/sessions/{scraper_name}_session.json")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        key = encryption_key.encode() if isinstance(encryption_key, str) else encryption_key
        self.fernet = Fernet(key)

    def save_session(self, cookies: list[dict], expires_hours: int = 24) -> None:
        data = {
            "cookies": cookies,
            "saved_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(hours=expires_hours)).isoformat(),
        }
        encrypted = self.fernet.encrypt(json.dumps(data).encode())
        self.path.write_bytes(encrypted)

    def load_session(self) -> Optional[list[dict]]:
        if not self.path.exists():
            return None
        try:
            decrypted = self.fernet.decrypt(self.path.read_bytes())
            data = json.loads(decrypted)
            expires_at = datetime.fromisoformat(data["expires_at"])
            if datetime.utcnow() > expires_at:
                return None
            return data["cookies"]
        except Exception:
            return None

    def is_session_valid(self) -> bool:
        return self.load_session() is not None

    def clear_session(self) -> None:
        if self.path.exists():
            self.path.unlink()
