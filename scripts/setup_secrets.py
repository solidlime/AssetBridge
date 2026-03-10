#!/usr/bin/env python3
"""
.env セットアップスクリプト。
~/.assetbridge/.env を作成する（プロジェクト外に隔離）。

使い方:
    python scripts/setup_secrets.py
"""
from pathlib import Path
import os
import shutil

ENV_DIR = Path(os.environ.get("ASSETBRIDGE_ENV_PATH", str(Path.home() / ".assetbridge" / ".env"))).parent
ENV_FILE = ENV_DIR / ".env"
EXAMPLE_FILE = Path(__file__).parent.parent / ".env.example"


def main():
    ENV_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)

    if ENV_FILE.exists():
        print(f"既存ファイルが見つかりました: {ENV_FILE}")
        answer = input("上書きしますか？ [y/N]: ").strip().lower()
        if answer != "y":
            print("キャンセルしました。")
            return

    shutil.copy(EXAMPLE_FILE, ENV_FILE)
    ENV_FILE.chmod(0o600)  # オーナーのみ読み書き可

    print(f"作成完了: {ENV_FILE}")
    print()
    print("以下のエディタで認証情報を入力してください:")
    print(f"  notepad {ENV_FILE}   (Windows)")
    print(f"  nano {ENV_FILE}      (bash)")
    print()
    print("このファイルは AI アシスタントのプロジェクトスコープ外のため、")
    print("明示的に許可しない限り読み取られません。")


if __name__ == "__main__":
    main()
