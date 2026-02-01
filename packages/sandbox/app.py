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

# Map short model names to full API model names
MODEL_NAME_MAP = {
    "claude-sonnet-4": "claude-sonnet-4-20250514",
    "claude-opus-4": "claude-opus-4-20250514",
    "claude-haiku-3-5": "claude-3-5-haiku-20241022",
}


def resolve_model_name(model: str) -> str:
    """Resolve short model name to full API model name."""
    return MODEL_NAME_MAP.get(model, model)

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
    .pip_install("httpx", "pydantic", "fastapi[standard]", "websocket-client")
    .env({"PATH": "/root/.local/bin:/usr/local/bin:/usr/bin:/bin"})
    .run_commands(
        # Install Claude Code CLI using official installer
        "curl -fsSL https://claude.ai/install.sh | bash",
        # Create symlink to standard location
        "ln -sf /root/.local/bin/claude /usr/local/bin/claude || true",
        # Verify installation and show path
        "ls -la /root/.local/bin/ || true",
        "claude --version || /root/.local/bin/claude --version || echo 'Claude installation failed'",
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
    """Sends events to the control plane via HTTP or WebSocket bridge."""

    def __init__(self, session_id: str, control_plane_url: str, internal_token: str):
        self.session_id = session_id
        self.control_plane_url = control_plane_url.rstrip("/")
        self.internal_token = internal_token
        self.bridge: Any = None  # Will be set when bridge connects

        import httpx
        self.client = httpx.Client(timeout=10.0)

    def set_bridge(self, bridge: Any) -> None:
        """Set the WebSocket bridge for event delivery."""
        self.bridge = bridge

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

        # Try WebSocket bridge first if available
        if self.bridge and self.bridge._connected:
            try:
                self.bridge.send_event(event)
                return
            except Exception as e:
                print(f"[sandbox] Bridge send failed, falling back to HTTP: {e}")

        # Fall back to HTTP
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

            # Clean up existing workspace directory if it exists
            if self.workspace_path.exists():
                import shutil
                shutil.rmtree(self.workspace_path)

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
        self.model = resolve_model_name(model)  # Resolve to full API model name
        self.emitter = emitter
        self.process: subprocess.Popen | None = None
        self._stop_requested = False
        self._claude_path = self._find_claude_path()
        print(f"[claude] Initialized with model: {self.model}")

    def _find_claude_path(self) -> str:
        """Find the Claude CLI executable path."""
        # Try multiple possible locations (official installer uses ~/.local/bin)
        paths_to_try = [
            CLAUDE_CODE_PATH,
            "/root/.local/bin/claude",  # Root user in container
            os.path.expanduser("~/.local/bin/claude"),
            "/usr/local/bin/claude",
            "/usr/bin/claude",
        ]

        for path in paths_to_try:
            if os.path.exists(path):
                print(f"[claude] Found Claude CLI at: {path}")
                return path

        # Try using 'which' to find it
        try:
            result = subprocess.run(["which", "claude"], capture_output=True, text=True)
            if result.returncode == 0 and result.stdout.strip():
                path = result.stdout.strip()
                print(f"[claude] Found Claude CLI via which: {path}")
                return path
        except Exception:
            pass

        # Last resort - check if it's in PATH
        print("[claude] Claude CLI not found in standard paths, trying 'claude' directly")
        return "claude"

    def run_prompt(self, prompt: str, message_id: str | None = None) -> dict[str, Any]:
        self._stop_requested = False

        # Debug: Show Claude path and API key status
        print(f"[claude] Using Claude CLI at: {self._claude_path}")
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        print(f"[claude] ANTHROPIC_API_KEY present: {bool(api_key)}, length: {len(api_key)}")

        if self._claude_path == "npx":
            cmd = [
                "npx", "@anthropic-ai/claude-code",
                "--print",
                "--output-format", "stream-json",
                "--verbose",
                "--model", self.model,
                prompt,
            ]
        else:
            cmd = [
                self._claude_path,
                "--print",
                "--output-format", "stream-json",
                "--verbose",
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
            error_text = "\n".join(error_lines) if error_lines else None

            # Log the result for debugging
            print(f"[claude] Process completed with exit code: {self.process.returncode}")
            if error_text:
                print(f"[claude] Stderr: {error_text[:500]}")  # First 500 chars

            # If failed, emit error event with details
            if not success and error_text:
                self.emitter.emit_error(f"Claude CLI error: {error_text[:200]}", message_id)

            self.emitter.emit_execution_complete(
                success=success,
                summary="Prompt completed" if success else f"Prompt failed: {error_text[:100] if error_text else 'unknown error'}",
                message_id=message_id,
            )

            return {
                "success": success,
                "exit_code": self.process.returncode,
                "output": "\n".join(output_lines),
                "error": error_text,
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
# Control Plane Bridge
# =============================================================================


class ControlPlaneBridge:
    """WebSocket bridge to control plane for receiving prompts and sending events."""

    def __init__(
        self,
        session_id: str,
        sandbox_id: str,
        control_plane_url: str,
        runner: ClaudeRunner,
    ):
        self.session_id = session_id
        self.sandbox_id = sandbox_id
        self.control_plane_url = control_plane_url
        self.runner = runner
        self.ws: Any = None  # websocket.WebSocket, lazy imported
        self._running = False
        self._connected = False

    def _get_ws_url(self) -> str:
        """Convert HTTP URL to WebSocket URL."""
        url = self.control_plane_url.rstrip("/")
        if url.startswith("https://"):
            url = "wss://" + url[8:]
        elif url.startswith("http://"):
            url = "ws://" + url[7:]
        return f"{url}/api/sessions/{self.session_id}/ws"

    def connect(self) -> bool:
        """Connect to the control plane WebSocket."""
        import websocket  # Lazy import - only available in sandbox_image

        ws_url = self._get_ws_url()
        print(f"[bridge] Connecting to {ws_url}")

        try:
            self.ws = websocket.create_connection(ws_url, timeout=30)

            # Generate auth token
            modal_secret = os.environ.get("MODAL_API_SECRET", "")
            auth_token = generate_internal_token(modal_secret)

            # Send sandbox_connect message
            connect_msg = {
                "type": "sandbox_connect",
                "sandboxId": self.sandbox_id,
                "token": auth_token,
            }
            self.ws.send(json.dumps(connect_msg))

            # Wait for confirmation
            response = self.ws.recv()
            data = json.loads(response)

            if data.get("type") == "sandbox_connected":
                print(f"[bridge] Connected to session: {data.get('sessionId')}")
                self._connected = True
                return True
            elif data.get("type") == "error":
                print(f"[bridge] Connection error: {data.get('message')}")
                return False
            else:
                print(f"[bridge] Unexpected response: {data}")
                return False

        except Exception as e:
            print(f"[bridge] Connection failed: {e}")
            return False

    def send_event(self, event: dict) -> None:
        """Send an event to the control plane."""
        if not self.ws or not self._connected:
            return

        try:
            msg = {"type": "event", "event": event}
            self.ws.send(json.dumps(msg))
        except Exception as e:
            print(f"[bridge] Failed to send event: {e}")

    def send_execution_started(self, message_id: str) -> None:
        """Notify that execution has started."""
        if not self.ws or not self._connected:
            return

        try:
            msg = {"type": "execution_started", "messageId": message_id}
            self.ws.send(json.dumps(msg))
        except Exception as e:
            print(f"[bridge] Failed to send execution_started: {e}")

    def send_execution_complete(self, message_id: str, success: bool) -> None:
        """Notify that execution has completed."""
        if not self.ws or not self._connected:
            return

        try:
            msg = {
                "type": "execution_complete",
                "messageId": message_id,
                "success": success,
            }
            self.ws.send(json.dumps(msg))
        except Exception as e:
            print(f"[bridge] Failed to send execution_complete: {e}")

    def run(self) -> None:
        """Main loop to receive and handle messages from control plane."""
        import websocket  # Lazy import for exception types

        if not self.ws or not self._connected:
            print("[bridge] Not connected, cannot run")
            return

        self._running = True
        print("[bridge] Starting message loop")

        while self._running:
            try:
                # Set timeout for recv to allow periodic stop checks
                self.ws.settimeout(5.0)
                message = self.ws.recv()

                if not message:
                    continue

                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "prompt":
                    self._handle_prompt(data)
                elif msg_type == "stop":
                    self._handle_stop()
                elif msg_type == "ping":
                    self.ws.send(json.dumps({"type": "pong"}))
                elif msg_type == "error":
                    print(f"[bridge] Error from control plane: {data.get('message')}")

            except websocket.WebSocketTimeoutException:
                # Timeout is expected, continue loop
                continue
            except websocket.WebSocketConnectionClosedException:
                print("[bridge] Connection closed")
                self._connected = False
                break
            except Exception as e:
                print(f"[bridge] Error in message loop: {e}")
                break

        print("[bridge] Message loop ended")

    def _handle_prompt(self, data: dict) -> None:
        """Handle a prompt message from control plane."""
        message_id = data.get("messageId")
        content = data.get("content")

        if not content:
            print("[bridge] Received prompt without content")
            return

        print(f"[bridge] Executing prompt: {message_id}")
        self.send_execution_started(message_id)

        # Execute the prompt
        result = self.runner.run_prompt(content, message_id)

        # Send completion
        self.send_execution_complete(message_id, result.get("success", False))

    def _handle_stop(self) -> None:
        """Handle a stop message from control plane."""
        print("[bridge] Received stop signal")
        self.runner.stop()

    def stop(self) -> None:
        """Stop the bridge."""
        self._running = False

    def close(self) -> None:
        """Close the WebSocket connection."""
        self._running = False
        self._connected = False
        if self.ws:
            try:
                self.ws.close()
            except Exception:
                pass
            self.ws = None


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
    bridge: ControlPlaneBridge | None = None
    _initialized: bool = False
    _session_id: str | None = None
    _sandbox_id: str | None = None
    _control_plane_url: str | None = None

    @enter()
    def setup(self):
        """Called when container starts."""
        pass

    @method()
    def initialize_and_run(
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
        """Initialize the sandbox and connect to control plane for prompt handling.

        This method:
        1. Clones the repo and checks out the branch
        2. Connects to the control plane via WebSocket
        3. Enters a message loop to receive and execute prompts
        4. Returns when the connection is closed or stopped
        """
        self._session_id = session_id
        self._sandbox_id = sandbox_id or str(uuid.uuid4())
        self._control_plane_url = control_plane_url

        modal_secret = os.environ.get("MODAL_API_SECRET", "")
        internal_token = generate_internal_token(modal_secret)
        self.emitter = EventEmitter(session_id, control_plane_url, internal_token)

        self.git = GitOperations(repo_owner, repo_name, branch, base_branch, self.emitter)

        # Clone and checkout repo (events sent via HTTP during this phase)
        github_token = os.environ.get("GITHUB_TOKEN", "")
        if not self.git.clone_repo(github_token):
            return {"success": False, "error": "Failed to clone repository"}

        if not self.git.checkout_branch():
            return {"success": False, "error": "Failed to checkout branch"}

        self.git.configure_user(git_user_name, git_user_email)

        # Create runner for Claude execution
        self.runner = ClaudeRunner(self.git.workspace_path, model, self.emitter)
        self._initialized = True

        # Create and connect the bridge
        self.bridge = ControlPlaneBridge(
            session_id=session_id,
            sandbox_id=self._sandbox_id,
            control_plane_url=control_plane_url,
            runner=self.runner,
        )

        if not self.bridge.connect():
            self.emitter.emit_error("Failed to connect to control plane")
            return {"success": False, "error": "Failed to connect to control plane"}

        # Set bridge on emitter for future events
        self.emitter.set_bridge(self.bridge)

        # Emit ready event via the bridge
        self.emitter.emit_git_sync("ready")

        print(f"[sandbox] Ready and connected to control plane, sandbox_id={self._sandbox_id}")

        # Enter the message loop (blocks until stopped)
        self.bridge.run()

        # Cleanup
        self.bridge.close()
        workspace_volume.commit()

        return {
            "success": True,
            "sandbox_id": self._sandbox_id,
            "completed": True,
        }

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
        """Initialize the sandbox with configuration (legacy, use initialize_and_run instead)."""
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
        if self.bridge:
            self.bridge.stop()
        return {"success": True}

    @method()
    def get_status(self) -> dict:
        """Get current sandbox status."""
        return {
            "status": "ready" if self._initialized else "not_initialized",
            "session_id": self._session_id,
            "sandbox_id": self._sandbox_id,
            "bridge_connected": self.bridge._connected if self.bridge else False,
        }

    @method()
    def cleanup(self) -> dict:
        """Clean up the sandbox resources."""
        if self.bridge:
            self.bridge.close()
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
    """Create a new sandbox instance.

    This spawns a long-running sandbox that:
    1. Clones the repository
    2. Connects to the control plane via WebSocket
    3. Waits for prompts and executes them
    """
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return {"success": False, "error": "Unauthorized"}

    token = auth_header[7:]
    modal_secret = os.environ.get("MODAL_API_SECRET", "")
    if not verify_internal_token(token, modal_secret):
        return {"success": False, "error": "Invalid token"}

    body = await request.json()
    sandbox_id = body.get("sandbox_id") or str(uuid.uuid4())

    # Use spawn() to run the sandbox asynchronously
    # The sandbox will connect back to control plane via WebSocket
    sandbox = Sandbox()
    call = sandbox.initialize_and_run.spawn(
        session_id=body.get("session_id"),
        sandbox_id=sandbox_id,
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

    return {
        "success": True,
        "data": {
            "sandbox_id": sandbox_id,
            "call_id": call.object_id,
            "status": "spawning",
            "created_at": int(time.time() * 1000),
        },
    }


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
