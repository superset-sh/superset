"""Event emission to the control plane."""

import time
import uuid
import httpx
from typing import Any

from .config import SandboxConfig, EventType


class EventEmitter:
    """Sends events to the control plane."""

    def __init__(self, config: SandboxConfig, internal_token: str):
        self.config = config
        self.internal_token = internal_token
        self.client = httpx.Client(timeout=10.0)
        self._base_url = config.control_plane_url.rstrip("/")

    def emit(
        self,
        event_type: str,
        data: dict[str, Any],
        message_id: str | None = None,
    ) -> None:
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
                f"{self._base_url}/internal/sandbox-event",
                json={"sessionId": self.config.session_id, "event": event},
                headers={"Authorization": f"Bearer {self.internal_token}"},
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            print(f"[sandbox] Failed to emit event: {e}")

    def emit_tool_call(
        self,
        tool_name: str,
        tool_input: dict[str, Any],
        message_id: str | None = None,
    ) -> None:
        """Emit a tool call event."""
        self.emit(
            EventType.TOOL_CALL,
            {"tool": tool_name, "input": tool_input},
            message_id,
        )

    def emit_tool_result(
        self,
        tool_name: str,
        result: Any,
        error: str | None = None,
        message_id: str | None = None,
    ) -> None:
        """Emit a tool result event."""
        data = {"tool": tool_name, "result": result}
        if error:
            data["error"] = error
        self.emit(EventType.TOOL_RESULT, data, message_id)

    def emit_token(self, token: str, message_id: str | None = None) -> None:
        """Emit a streaming token."""
        self.emit(EventType.TOKEN, {"token": token}, message_id)

    def emit_error(self, error: str, message_id: str | None = None) -> None:
        """Emit an error event."""
        self.emit(EventType.ERROR, {"error": error}, message_id)

    def emit_git_sync(self, status: str, details: dict[str, Any] | None = None) -> None:
        """Emit a git sync event."""
        data = {"status": status}
        if details:
            data.update(details)
        self.emit(EventType.GIT_SYNC, data)

    def emit_execution_complete(
        self,
        success: bool,
        summary: str | None = None,
        message_id: str | None = None,
    ) -> None:
        """Emit execution complete event."""
        self.emit(
            EventType.EXECUTION_COMPLETE,
            {"success": success, "summary": summary},
            message_id,
        )

    def emit_heartbeat(self) -> None:
        """Emit a heartbeat event."""
        self.emit(EventType.HEARTBEAT, {"timestamp": int(time.time() * 1000)})

    def close(self) -> None:
        """Close the HTTP client."""
        self.client.close()
