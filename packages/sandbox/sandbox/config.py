"""Configuration for the sandbox environment."""

from pydantic import BaseModel


class SandboxConfig(BaseModel):
    """Configuration for a sandbox instance."""

    session_id: str
    sandbox_id: str | None = None
    repo_owner: str
    repo_name: str
    branch: str
    base_branch: str = "main"
    control_plane_url: str
    sandbox_auth_token: str
    snapshot_id: str | None = None
    git_user_name: str | None = None
    git_user_email: str | None = None
    provider: str = "anthropic"
    model: str = "claude-sonnet-4"


class EventType:
    """Event types sent to the control plane."""

    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    TOKEN = "token"
    ERROR = "error"
    GIT_SYNC = "git_sync"
    EXECUTION_COMPLETE = "execution_complete"
    HEARTBEAT = "heartbeat"


# Modal configuration
MODAL_APP_NAME = "superset-cloud"
MODAL_IMAGE_NAME = "superset-sandbox"

# Timeouts
SANDBOX_TIMEOUT_SECONDS = 3600  # 1 hour max
GIT_CLONE_TIMEOUT_SECONDS = 300  # 5 minutes
CLAUDE_EXECUTION_TIMEOUT_SECONDS = 600  # 10 minutes per prompt

# Paths
WORKSPACE_ROOT = "/workspace"
CLAUDE_CODE_PATH = "/usr/local/bin/claude"
