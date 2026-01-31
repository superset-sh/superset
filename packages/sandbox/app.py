"""
Superset Cloud Sandbox - Modal Application

Single-file Modal app for cloud workspace execution.
Deploy with: modal deploy app.py
"""

import hashlib
import hmac
import json
import os
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import modal
from modal import Image, Secret, Volume, method, enter

# =============================================================================
# Configuration
# =============================================================================

MODAL_APP_NAME = "superset-cloud"
WORKSPACE_ROOT = "/workspace"
SANDBOX_TIMEOUT_SECONDS = 3600  # 1 hour max
GIT_CLONE_TIMEOUT_SECONDS = 300  # 5 minutes
CLAUDE_EXECUTION_TIMEOUT_SECONDS = 600  # 10 minutes per prompt
CLAUDE_CODE_PATH = "/usr/local/bin/claude"

# =============================================================================
# Modal App Setup
# =============================================================================

app = modal.App(MODAL_APP_NAME)

# Define the sandbox image with Claude Code installed
sandbox_image = (
    Image.debian_slim(python_version="3.11")
    .apt_install("git", "curl", "ca-certificates")
    .run_commands(
        # Install Node.js 20
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
    )
    .pip_install("httpx", "pydantic", "fastapi[standard]")
    .run_commands(
        # Install Claude Code CLI
        "npm install -g @anthropic-ai/claude-code",
    )
)

# Image for web endpoints (just needs FastAPI)
web_image = Image.debian_slim(python_version="3.11").pip_install("httpx", "fastapi[standard]")

# Volume for workspace persistence
workspace_volume = Volume.from_name("superset-workspaces", create_if_missing=True)

# =============================================================================
# Authentication Helpers
# =============================================================================


def generate_internal_token(secret: str) -> str:
    """Generate HMAC-signed token for control plane authentication."""
    timestamp = str(int(time.time() * 1000))
    signature = hmac.new(
        secret.encode(),
        timestamp.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{timestamp}.{signature}"


def verify_internal_token(token: str, secret: str, max_age_ms: int = 5 * 60 * 1000) -> bool:
    """Verify an HMAC-signed token."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return False

        timestamp_str, signature = parts
        timestamp = int(timestamp_str)

        # Check expiration
        now = int(time.time() * 1000)
        if now - timestamp > max_age_ms:
            return False

        # Verify signature
        expected = hmac.new(
            secret.encode(),
            timestamp_str.encode(),
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(signature, expected)
    except Exception:
        return False


# =============================================================================
# Event Emitter
# =============================================================================


class EventEmitter:
    """Sends events to the control plane."""

    def __init__(self, session_id: str, control_plane_url: str, internal_token: str):
        self.session_id = session_id
        self.control_plane_url = control_plane_url.rstrip("/")
        self.internal_token = internal_token

        import httpx
        self.client = httpx.Client(timeout=10.0)

    def emit(self, event_type: str, data: dict[str, Any], message_id: str | None = None) -> None:
        """Emit an event to the control plane."""
        event = {
            "id": str(uuid.uuid4()),
            "type": event_type,
            "timestamp": int(time.time() * 1000),
            "data": data,
        }
        if message_id:
            event["messageId"] = message_id

        try:
            response = self.client.post(
                f"{self.control_plane_url}/internal/sandbox-event",
                json={"sessionId": self.session_id, "event": event},
                headers={"Authorization": f"Bearer {self.internal_token}"},
            )
            response.raise_for_status()
        except Exception as e:
            print(f"[sandbox] Failed to emit event: {e}")

    def emit_git_sync(self, status: str, details: dict[str, Any] | None = None) -> None:
        data = {"status": status}
        if details:
            data.update(details)
        self.emit("git_sync", data)

    def emit_error(self, error: str, message_id: str | None = None) -> None:
        self.emit("error", {"error": error}, message_id)

    def emit_token(self, token: str, message_id: str | None = None) -> None:
        self.emit("token", {"token": token}, message_id)

    def emit_tool_call(self, tool_name: str, tool_input: dict, message_id: str | None = None) -> None:
        self.emit("tool_call", {"tool": tool_name, "input": tool_input}, message_id)

    def emit_tool_result(self, tool_name: str, result: Any, error: str | None = None, message_id: str | None = None) -> None:
        data = {"tool": tool_name, "result": result}
        if error:
            data["error"] = error
        self.emit("tool_result", data, message_id)

    def emit_execution_complete(self, success: bool, summary: str | None = None, message_id: str | None = None) -> None:
        self.emit("execution_complete", {"success": success, "summary": summary}, message_id)

    def close(self) -> None:
        self.client.close()


# =============================================================================
# Git Operations
# =============================================================================


class GitOperations:
    """Handles git operations within the sandbox."""

    def __init__(self, repo_owner: str, repo_name: str, branch: str, base_branch: str, emitter: EventEmitter):
        self.repo_owner = repo_owner
        self.repo_name = repo_name
        self.branch = branch
        self.base_branch = base_branch
        self.emitter = emitter
        self.workspace_path = Path(WORKSPACE_ROOT) / repo_name

    def _run_git(self, args: list[str], cwd: Path | None = None, timeout: int | None = None) -> subprocess.CompletedProcess:
        cmd = ["git"] + args
        return subprocess.run(
            cmd,
            cwd=cwd or self.workspace_path,
            capture_output=True,
            text=True,
            timeout=timeout or 60,
        )

    def clone_repo(self, github_token: str) -> bool:
        self.emitter.emit_git_sync("cloning")
        clone_url = f"https://x-access-token:{github_token}@github.com/{self.repo_owner}/{self.repo_name}.git"

        try:
            Path(WORKSPACE_ROOT).mkdir(parents=True, exist_ok=True)

            result = self._run_git(
                ["clone", "--depth", "100", clone_url, str(self.workspace_path)],
                cwd=Path(WORKSPACE_ROOT),
                timeout=GIT_CLONE_TIMEOUT_SECONDS,
            )

            if result.returncode != 0:
                self.emitter.emit_error(f"Git clone failed: {result.stderr}")
                return False

            self.emitter.emit_git_sync("cloned", {"repo": f"{self.repo_owner}/{self.repo_name}"})
            return True

        except subprocess.TimeoutExpired:
            self.emitter.emit_error("Git clone timed out")
            return False
        except Exception as e:
            self.emitter.emit_error(f"Git clone error: {str(e)}")
            return False

    def checkout_branch(self) -> bool:
        self.emitter.emit_git_sync("checking_out", {"branch": self.branch})

        try:
            result = self._run_git(["fetch", "origin", self.base_branch])
            if result.returncode != 0:
                self.emitter.emit_error(f"Failed to fetch base branch: {result.stderr}")
                return False

            result = self._run_git(["ls-remote", "--heads", "origin", self.branch])

            if self.branch in result.stdout:
                result = self._run_git(["checkout", self.branch])
                if result.returncode != 0:
                    result = self._run_git(["checkout", "-b", self.branch, f"origin/{self.branch}"])
                if result.returncode == 0:
                    self._run_git(["pull", "origin", self.branch])
            else:
                result = self._run_git(["checkout", "-b", self.branch, f"origin/{self.base_branch}"])

            if result.returncode != 0:
                self.emitter.emit_error(f"Failed to checkout branch: {result.stderr}")
                return False

            self.emitter.emit_git_sync("checked_out", {"branch": self.branch})
            return True

        except Exception as e:
            self.emitter.emit_error(f"Checkout error: {str(e)}")
            return False

    def configure_user(self, name: str | None = None, email: str | None = None) -> None:
        self._run_git(["config", "user.name", name or "Superset Bot"])
        self._run_git(["config", "user.email", email or "bot@superset.sh"])


# =============================================================================
# Claude Runner
# =============================================================================


class ClaudeRunner:
    """Runs Claude Code in the sandbox environment."""

    def __init__(self, workspace_path: Path, model: str, emitter: EventEmitter):
        self.workspace_path = workspace_path
        self.model = model
        self.emitter = emitter
        self.process: subprocess.Popen | None = None
        self._stop_requested = False

    def run_prompt(self, prompt: str, message_id: str | None = None) -> dict[str, Any]:
        self._stop_requested = False

        cmd = [
            CLAUDE_CODE_PATH,
            "--print",
            "--output-format", "stream-json",
            "--model", self.model,
            prompt,
        ]

        env = os.environ.copy()
        env["CLAUDE_CODE_NO_INTERACTIVE"] = "1"

        try:
            self.process = subprocess.Popen(
                cmd,
                cwd=self.workspace_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
            )

            output_lines = []
            error_lines = []

            def read_stdout():
                for line in self.process.stdout:
                    if self._stop_requested:
                        break
                    line = line.strip()
                    if line:
                        output_lines.append(line)
                        self._process_output_line(line, message_id)

            def read_stderr():
                for line in self.process.stderr:
                    if self._stop_requested:
                        break
                    line = line.strip()
                    if line:
                        error_lines.append(line)

            stdout_thread = threading.Thread(target=read_stdout)
            stderr_thread = threading.Thread(target=read_stderr)

            stdout_thread.start()
            stderr_thread.start()

            try:
                self.process.wait(timeout=CLAUDE_EXECUTION_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.emitter.emit_error("Execution timed out", message_id)
                return {"success": False, "error": "Execution timed out"}

            stdout_thread.join(timeout=5)
            stderr_thread.join(timeout=5)

            success = self.process.returncode == 0
            self.emitter.emit_execution_complete(
                success=success,
                summary="Prompt completed" if success else "Prompt failed",
                message_id=message_id,
            )

            return {
                "success": success,
                "exit_code": self.process.returncode,
                "output": "\n".join(output_lines),
                "error": "\n".join(error_lines) if error_lines else None,
            }

        except Exception as e:
            self.emitter.emit_error(str(e), message_id)
            return {"success": False, "error": str(e)}

        finally:
            self.process = None

    def _process_output_line(self, line: str, message_id: str | None) -> None:
        try:
            event = json.loads(line)
            event_type = event.get("type")

            if event_type == "assistant":
                content = event.get("message", {}).get("content", [])
                for block in content:
                    if block.get("type") == "text":
                        self.emitter.emit_token(block.get("text", ""), message_id)

            elif event_type == "tool_use":
                self.emitter.emit_tool_call(
                    event.get("name", "unknown"),
                    event.get("input", {}),
                    message_id,
                )

            elif event_type == "tool_result":
                self.emitter.emit_tool_result(
                    event.get("name", "unknown"),
                    event.get("output"),
                    event.get("error"),
                    message_id,
                )

            elif event_type == "error":
                self.emitter.emit_error(event.get("error", "Unknown error"), message_id)

        except json.JSONDecodeError:
            self.emitter.emit_token(line, message_id)

    def stop(self) -> None:
        self._stop_requested = True
        if self.process:
            self.process.terminate()
            time.sleep(0.5)
            if self.process.poll() is None:
                self.process.kill()


# =============================================================================
# Modal Sandbox Class
# =============================================================================


@app.cls(
    image=sandbox_image,
    volumes={WORKSPACE_ROOT: workspace_volume},
    secrets=[Secret.from_name("superset-modal-secrets")],
    timeout=SANDBOX_TIMEOUT_SECONDS,
)
class Sandbox:
    """Modal class for sandbox execution."""

    emitter: EventEmitter | None = None
    git: GitOperations | None = None
    runner: ClaudeRunner | None = None
    _initialized: bool = False
    _session_id: str | None = None
    _sandbox_id: str | None = None

    @enter()
    def setup(self):
        """Called when container starts."""
        pass

    @method()
    def initialize(
        self,
        session_id: str,
        sandbox_id: str | None,
        repo_owner: str,
        repo_name: str,
        branch: str,
        base_branch: str,
        control_plane_url: str,
        sandbox_auth_token: str,
        snapshot_id: str | None = None,
        git_user_name: str | None = None,
        git_user_email: str | None = None,
        provider: str = "anthropic",
        model: str = "claude-sonnet-4",
    ) -> dict:
        """Initialize the sandbox with configuration."""
        self._session_id = session_id
        self._sandbox_id = sandbox_id or str(uuid.uuid4())

        modal_secret = os.environ.get("MODAL_API_SECRET", "")
        internal_token = generate_internal_token(modal_secret)
        self.emitter = EventEmitter(session_id, control_plane_url, internal_token)

        self.git = GitOperations(repo_owner, repo_name, branch, base_branch, self.emitter)

        github_token = os.environ.get("GITHUB_TOKEN", "")
        if not self.git.clone_repo(github_token):
            return {"success": False, "error": "Failed to clone repository"}

        if not self.git.checkout_branch():
            return {"success": False, "error": "Failed to checkout branch"}

        self.git.configure_user(git_user_name, git_user_email)

        self.runner = ClaudeRunner(self.git.workspace_path, model, self.emitter)

        self._initialized = True
        self.emitter.emit_git_sync("ready")

        return {
            "success": True,
            "sandbox_id": self._sandbox_id,
            "workspace_path": str(self.git.workspace_path),
        }

    @method()
    def run_prompt(self, prompt: str, message_id: str | None = None) -> dict:
        """Execute a prompt in the sandbox."""
        if not self._initialized or not self.runner:
            return {"success": False, "error": "Sandbox not initialized"}

        return self.runner.run_prompt(prompt, message_id)

    @method()
    def stop(self) -> dict:
        """Stop the current execution."""
        if self.runner:
            self.runner.stop()
        return {"success": True}

    @method()
    def get_status(self) -> dict:
        """Get current sandbox status."""
        return {
            "status": "ready" if self._initialized else "not_initialized",
            "session_id": self._session_id,
            "sandbox_id": self._sandbox_id,
        }

    @method()
    def cleanup(self) -> dict:
        """Clean up the sandbox resources."""
        if self.emitter:
            self.emitter.close()
        workspace_volume.commit()
        return {"success": True}


# =============================================================================
# API Endpoints (using FastAPI)
# =============================================================================

from fastapi import Request, Response


@app.function(image=web_image, secrets=[Secret.from_name("superset-modal-secrets")])
@modal.fastapi_endpoint(method="POST")
async def api_create_sandbox(request: Request) -> dict:
    """Create a new sandbox instance."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return {"success": False, "error": "Unauthorized"}

    token = auth_header[7:]
    modal_secret = os.environ.get("MODAL_API_SECRET", "")
    if not verify_internal_token(token, modal_secret):
        return {"success": False, "error": "Invalid token"}

    body = await request.json()

    sandbox = Sandbox()
    result = sandbox.initialize.remote(
        session_id=body.get("session_id"),
        sandbox_id=body.get("sandbox_id"),
        repo_owner=body.get("repo_owner"),
        repo_name=body.get("repo_name"),
        branch=body.get("branch"),
        base_branch=body.get("base_branch", "main"),
        control_plane_url=body.get("control_plane_url"),
        sandbox_auth_token=body.get("sandbox_auth_token"),
        snapshot_id=body.get("snapshot_id"),
        git_user_name=body.get("git_user_name"),
        git_user_email=body.get("git_user_email"),
        provider=body.get("provider", "anthropic"),
        model=body.get("model", "claude-sonnet-4"),
    )

    if result.get("success"):
        return {
            "success": True,
            "data": {
                "sandbox_id": result.get("sandbox_id"),
                "status": "ready",
                "created_at": int(time.time() * 1000),
            },
        }

    return {"success": False, "error": result.get("error", "Failed to create sandbox")}


@app.function(image=web_image, secrets=[Secret.from_name("superset-modal-secrets")])
@modal.fastapi_endpoint(method="POST")
async def api_warm_sandbox(request: Request) -> dict:
    """Pre-warm a sandbox for faster startup."""
    return {"success": True, "data": {"sandbox_id": str(uuid.uuid4()), "status": "warming"}}


@app.function(image=web_image)
@modal.fastapi_endpoint(method="GET")
async def api_health() -> dict:
    """Health check endpoint."""
    return {"success": True, "data": {"status": "ok", "service": "superset-sandbox"}}


@app.function(image=web_image, secrets=[Secret.from_name("superset-modal-secrets")])
@modal.fastapi_endpoint(method="POST")
async def api_terminate_sandbox(request: Request) -> dict:
    """Terminate a sandbox."""
    return {"success": True}


@app.function(image=web_image, secrets=[Secret.from_name("superset-modal-secrets")])
@modal.fastapi_endpoint(method="POST")
async def api_snapshot_sandbox(request: Request) -> dict:
    """Take a snapshot of a sandbox."""
    workspace_volume.commit()
    return {"success": True, "data": {"snapshot_id": str(uuid.uuid4())}}


@app.function(image=web_image, secrets=[Secret.from_name("superset-modal-secrets")])
@modal.fastapi_endpoint(method="GET")
async def api_snapshot(request: Request) -> dict:
    """Get the latest snapshot for a repository."""
    return {"success": True, "data": None}
