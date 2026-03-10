#!/usr/bin/env python3
"""
機密ファイルのセットアップスクリプト。
~/.assetbridge/.env.secrets を作成する。

使い方:
    python scripts/setup_secrets.py
"""
from pathlib import Path
import shutil

SECRETS_DIR = Path.home() / ".assetbridge"
SECRETS_FILE = SECRETS_DIR / ".env.secrets"
EXAMPLE_FILE = Path(__file__).parent.parent / ".env.secrets.example"


def main():
    SECRETS_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)

    if SECRETS_FILE.exists():
        print(f"既存ファイルが見つかりました: {SECRETS_FILE}")
        answer = input("上書きしますか？ [y/N]: ").strip().lower()
        if answer != "y":
            print("キャンセルしました。")
            return

    shutil.copy(EXAMPLE_FILE, SECRETS_FILE)
    SECRETS_FILE.chmod(0o600)  # オーナーのみ読み書き可

    print(f"作成完了: {SECRETS_FILE}")
    print()
    print("以下のエディタで認証情報を入力してください:")
    print(f"  notepad {SECRETS_FILE}   (Windows)")
    print(f"  nano {SECRETS_FILE}      (bash)")
    print()
    print("⚠️  このファイルは AIアシスタントに見せないでください。")


if __name__ == "__main__":
    main()
