"""Modal application for Superset cloud sandboxes."""

import hashlib
import hmac
import os
import time
import uuid
from pathlib import Path

import modal
from modal import Image, Secret, Volume, method

from .config import (
    SandboxConfig,
    MODAL_APP_NAME,
    WORKSPACE_ROOT,
    SANDBOX_TIMEOUT_SECONDS,
)
from .events import EventEmitter
from .git_ops import GitOperations
from .runner import ClaudeRunner

# Modal app definition
app = modal.App(MODAL_APP_NAME)

# Define the sandbox image with Claude Code installed
sandbox_image = (
    Image.debian_slim(python_version="3.11")
    .apt_install("git", "curl", "nodejs", "npm")
    .pip_install("httpx", "pydantic")
    # Install Claude Code CLI
    .run_commands(
        "npm install -g @anthropic-ai/claude-code",
    )
)

# Volume for workspace persistence
workspace_volume = Volume.from_name("superset-workspaces", create_if_missing=True)


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


@app.cls(
    image=sandbox_image,
    volumes={WORKSPACE_ROOT: workspace_volume},
    secrets=[
        Secret.from_name("superset-modal-secrets"),
    ],
    timeout=SANDBOX_TIMEOUT_SECONDS,
    allow_concurrent_inputs=10,
)
class Sandbox:
    """Modal class for sandbox execution."""

    def __init__(self):
        self.config: SandboxConfig | None = None
        self.emitter: EventEmitter | None = None
        self.git: GitOperations | None = None
        self.runner: ClaudeRunner | None = None
        self._initialized = False

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
        self.config = SandboxConfig(
            session_id=session_id,
            sandbox_id=sandbox_id or str(uuid.uuid4()),
            repo_owner=repo_owner,
            repo_name=repo_name,
            branch=branch,
            base_branch=base_branch,
            control_plane_url=control_plane_url,
            sandbox_auth_token=sandbox_auth_token,
            snapshot_id=snapshot_id,
            git_user_name=git_user_name,
            git_user_email=git_user_email,
            provider=provider,
            model=model,
        )

        # Create event emitter
        modal_secret = os.environ.get("MODAL_API_SECRET", "")
        internal_token = generate_internal_token(modal_secret)
        self.emitter = EventEmitter(self.config, internal_token)

        # Create git operations handler
        self.git = GitOperations(self.config, self.emitter)

        # Clone and setup repository
        github_token = os.environ.get("GITHUB_TOKEN", "")
        if not self.git.clone_repo(github_token):
            return {"success": False, "error": "Failed to clone repository"}

        if not self.git.checkout_branch():
            return {"success": False, "error": "Failed to checkout branch"}

        self.git.configure_user()

        # Create Claude runner
        self.runner = ClaudeRunner(
            self.config,
            self.emitter,
            self.git.workspace_path,
        )

        self._initialized = True
        self.emitter.emit_git_sync("ready")

        return {
            "success": True,
            "sandbox_id": self.config.sandbox_id,
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
        if not self._initialized or not self.git:
            return {"status": "not_initialized"}

        git_status = self.git.get_status()
        return {
            "status": "ready",
            "session_id": self.config.session_id if self.config else None,
            "sandbox_id": self.config.sandbox_id if self.config else None,
            "git": git_status,
        }

    @method()
    def sync_changes(self) -> dict:
        """Push any pending changes to remote."""
        if not self._initialized or not self.git:
            return {"success": False, "error": "Sandbox not initialized"}

        success = self.git.push_changes()
        return {"success": success}

    @method()
    def cleanup(self) -> dict:
        """Clean up the sandbox resources."""
        if self.emitter:
            self.emitter.close()

        # Commit the volume to persist workspace state
        workspace_volume.commit()

        return {"success": True}


# API endpoints for the control plane
@app.function(secrets=[Secret.from_name("superset-modal-secrets")])
@modal.web_endpoint(method="POST")
def api_create_sandbox(request: dict) -> dict:
    """Create a new sandbox instance."""
    # Verify authorization
    auth_header = request.get("headers", {}).get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return {"success": False, "error": "Unauthorized"}

    token = auth_header[7:]
    modal_secret = os.environ.get("MODAL_API_SECRET", "")
    if not verify_internal_token(token, modal_secret):
        return {"success": False, "error": "Invalid token"}

    body = request.get("body", {})

    # Create sandbox instance
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


@app.function(secrets=[Secret.from_name("superset-modal-secrets")])
@modal.web_endpoint(method="POST")
def api_warm_sandbox(request: dict) -> dict:
    """Pre-warm a sandbox for faster startup."""
    # For now, just return success - warming is handled by Modal's container lifecycle
    return {"success": True, "data": {"sandbox_id": str(uuid.uuid4()), "status": "warming"}}


@app.function()
@modal.web_endpoint(method="GET")
def api_health() -> dict:
    """Health check endpoint."""
    return {"success": True, "data": {"status": "ok", "service": "superset-sandbox"}}


@app.function(secrets=[Secret.from_name("superset-modal-secrets")])
@modal.web_endpoint(method="POST")
def api_terminate_sandbox(request: dict) -> dict:
    """Terminate a sandbox."""
    # Modal handles cleanup automatically when the function ends
    return {"success": True}


@app.function(secrets=[Secret.from_name("superset-modal-secrets")])
@modal.web_endpoint(method="POST")
def api_snapshot_sandbox(request: dict) -> dict:
    """Take a snapshot of a sandbox."""
    # Commit the volume to create a snapshot point
    workspace_volume.commit()
    return {
        "success": True,
        "data": {"snapshot_id": str(uuid.uuid4())},
    }


@app.function(secrets=[Secret.from_name("superset-modal-secrets")])
@modal.web_endpoint(method="POST")
def api_restore_sandbox(request: dict) -> dict:
    """Restore a sandbox from a snapshot."""
    body = request.get("body", {})

    # Create a new sandbox from the snapshot
    # The volume will already have the workspace state
    sandbox = Sandbox()
    result = sandbox.initialize.remote(
        session_id=body.get("session_id"),
        sandbox_id=body.get("sandbox_id"),
        repo_owner=body.get("repo_owner", ""),
        repo_name=body.get("repo_name", ""),
        branch=body.get("branch", "main"),
        base_branch=body.get("base_branch", "main"),
        control_plane_url=body.get("control_plane_url"),
        sandbox_auth_token=body.get("sandbox_auth_token"),
    )

    return {
        "success": result.get("success", False),
        "data": {
            "sandbox_id": result.get("sandbox_id"),
            "status": "ready" if result.get("success") else "failed",
            "created_at": int(time.time() * 1000),
        },
    }


@app.function(secrets=[Secret.from_name("superset-modal-secrets")])
@modal.web_endpoint(method="GET")
def api_snapshot(request: dict) -> dict:
    """Get the latest snapshot for a repository."""
    # For now, return null - snapshot management will be enhanced later
    return {"success": True, "data": None}
