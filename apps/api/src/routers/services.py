"""Discord Bot / MCP Server のプロセス管理エンドポイント。

サービスは FastAPI 内部から subprocess として起動・停止する。
プロセスハンドルはモジュールレベルの _processes に保持される（API 再起動で失われる）。
"""
import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from ..config.settings import settings
from ..db.database import db_session
from ..db.repositories import AppSettingsRepository

router = APIRouter(prefix="/services", tags=["services"])

# プロセスハンドルレジストリ。キー: "discord" | "mcp"
_processes: dict[str, subprocess.Popen] = {}

# プロジェクトルートと venv Python のパスを解決する
# このファイルは apps/api/src/routers/services.py に置かれるため、
# 5階層上 (routers → src → api → apps → project root) がプロジェクトルートになる
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
_VENV_PYTHON = (
    _PROJECT_ROOT
    / ".venv"
    / ("Scripts" if sys.platform == "win32" else "bin")
    / ("python.exe" if sys.platform == "win32" else "python")
)
# venv が存在しない場合は現在のインタープリタにフォールバック
_PYTHON = str(_VENV_PYTHON) if _VENV_PYTHON.exists() else sys.executable


def verify_api_key(x_api_key: str = Header(...)) -> None:
    """X-API-Key ヘッダーが設定値と一致するか検証する。"""
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")


def _is_running(name: str) -> bool:
    """指定サービスのプロセスが生存しているか返す。"""
    proc = _processes.get(name)
    return proc is not None and proc.poll() is None


def _stop_process(name: str) -> None:
    """指定サービスのプロセスを SIGTERM → SIGKILL の順で停止する。"""
    proc = _processes.pop(name, None)
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


# ---- Pydantic モデル ----

class DiscordSettingsPayload(BaseModel):
    token: str = ""
    channel_id: str = ""


class McpSettingsPayload(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8001


# ====== Discord Bot ======

@router.get("/discord/status")
def discord_status(_: None = Depends(verify_api_key)) -> dict:
    """Discord Bot の起動状態を返す。"""
    return {"running": _is_running("discord")}


@router.post("/discord/start")
def discord_start(_: None = Depends(verify_api_key)) -> dict:
    """Discord Bot を subprocess として起動する。"""
    if _is_running("discord"):
        return {"status": "already_running"}
    bot_dir = _PROJECT_ROOT / "apps" / "discord-bot"
    proc = subprocess.Popen(
        [_PYTHON, "-m", "src.bot"],
        cwd=str(bot_dir),
    )
    _processes["discord"] = proc
    return {"status": "started", "pid": proc.pid}


@router.post("/discord/stop")
def discord_stop(_: None = Depends(verify_api_key)) -> dict:
    """Discord Bot を停止する。"""
    _stop_process("discord")
    return {"status": "stopped"}


@router.get("/discord/settings")
def get_discord_settings(_: None = Depends(verify_api_key)) -> dict:
    """Discord Bot 設定（トークンはマスク表示）を返す。"""
    with db_session() as db:
        repo = AppSettingsRepository(db)
        token = repo.get_discord_token()
        channel_id = repo.get_discord_channel_id()
    masked = (
        f"{token[:6]}...{token[-4:]}"
        if token and len(token) > 10
        else ("****" if token else "")
    )
    return {
        "token_masked": masked,
        "token_set": bool(token),
        "channel_id": channel_id,
    }


@router.put("/discord/settings")
def update_discord_settings(
    payload: DiscordSettingsPayload,
    _: None = Depends(verify_api_key),
) -> dict:
    """Discord Bot の DISCORD_TOKEN / DISCORD_CHANNEL_ID を DB に保存する。"""
    with db_session() as db:
        repo = AppSettingsRepository(db)
        if payload.token:
            repo.set_discord_token(payload.token)
        if payload.channel_id:
            repo.set_discord_channel_id(payload.channel_id)
    return {"status": "ok"}


# ====== MCP Server ======

@router.get("/mcp/status")
def mcp_status(_: None = Depends(verify_api_key)) -> dict:
    """MCP Server の起動状態を返す。"""
    return {"running": _is_running("mcp")}


@router.post("/mcp/start")
def mcp_start(_: None = Depends(verify_api_key)) -> dict:
    """MCP Server を subprocess として起動する。

    DB から host / port を読み取り、環境変数 MCP_HOST / MCP_PORT として渡す。
    """
    if _is_running("mcp"):
        return {"status": "already_running"}
    with db_session() as db:
        repo = AppSettingsRepository(db)
        host = repo.get_mcp_host()
        port = repo.get_mcp_port()
    mcp_dir = _PROJECT_ROOT / "apps" / "mcp"
    env = {**os.environ, "MCP_HOST": host, "MCP_PORT": str(port)}
    proc = subprocess.Popen(
        [_PYTHON, "-m", "src.server"],
        cwd=str(mcp_dir),
        env=env,
    )
    _processes["mcp"] = proc
    return {"status": "started", "pid": proc.pid}


@router.post("/mcp/stop")
def mcp_stop(_: None = Depends(verify_api_key)) -> dict:
    """MCP Server を停止する。"""
    _stop_process("mcp")
    return {"status": "stopped"}


@router.get("/mcp/settings")
def get_mcp_settings(_: None = Depends(verify_api_key)) -> dict:
    """MCP Server の host / port 設定を返す。"""
    with db_session() as db:
        repo = AppSettingsRepository(db)
        host = repo.get_mcp_host()
        port = repo.get_mcp_port()
    return {"host": host, "port": port}


@router.put("/mcp/settings")
def update_mcp_settings(
    payload: McpSettingsPayload,
    _: None = Depends(verify_api_key),
) -> dict:
    """MCP Server の host / port を DB に保存する。"""
    with db_session() as db:
        repo = AppSettingsRepository(db)
        repo.set_mcp_settings(payload.host, payload.port)
    return {"status": "ok", "host": payload.host, "port": payload.port}
