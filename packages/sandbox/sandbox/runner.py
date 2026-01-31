"""Claude Code runner for sandbox execution."""

import json
import subprocess
import threading
import time
from pathlib import Path
from typing import Callable, Any

from .config import SandboxConfig, CLAUDE_CODE_PATH, CLAUDE_EXECUTION_TIMEOUT_SECONDS
from .events import EventEmitter


class ClaudeRunner:
    """Runs Claude Code in the sandbox environment."""

    def __init__(
        self,
        config: SandboxConfig,
        emitter: EventEmitter,
        workspace_path: Path,
    ):
        self.config = config
        self.emitter = emitter
        self.workspace_path = workspace_path
        self.process: subprocess.Popen | None = None
        self._stop_requested = False

    def run_prompt(
        self,
        prompt: str,
        message_id: str | None = None,
        on_event: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """Execute a prompt through Claude Code."""
        self._stop_requested = False

        # Build command
        cmd = [
            CLAUDE_CODE_PATH,
            "--print",  # Output to stdout in JSON format
            "--output-format", "stream-json",
            "--model", self.config.model,
            prompt,
        ]

        # Environment variables
        env = {
            "ANTHROPIC_API_KEY": "",  # Will be set from Modal secrets
            "CLAUDE_CODE_NO_INTERACTIVE": "1",
            "HOME": "/root",
            "PATH": "/usr/local/bin:/usr/bin:/bin",
        }

        try:
            self.process = subprocess.Popen(
                cmd,
                cwd=self.workspace_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
            )

            # Start output processing in a thread
            output_lines = []
            error_lines = []

            def read_stdout():
                for line in self.process.stdout:
                    if self._stop_requested:
                        break
                    line = line.strip()
                    if line:
                        output_lines.append(line)
                        self._process_output_line(line, message_id, on_event)

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

            # Wait for completion with timeout
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

    def _process_output_line(
        self,
        line: str,
        message_id: str | None,
        on_event: Callable[[dict[str, Any]], None] | None,
    ) -> None:
        """Process a line of output from Claude Code."""
        try:
            event = json.loads(line)
            event_type = event.get("type")

            if event_type == "assistant":
                # Assistant text output
                content = event.get("message", {}).get("content", [])
                for block in content:
                    if block.get("type") == "text":
                        # Stream tokens
                        self.emitter.emit_token(block.get("text", ""), message_id)

            elif event_type == "tool_use":
                # Tool call
                self.emitter.emit_tool_call(
                    event.get("name", "unknown"),
                    event.get("input", {}),
                    message_id,
                )

            elif event_type == "tool_result":
                # Tool result
                self.emitter.emit_tool_result(
                    event.get("name", "unknown"),
                    event.get("output"),
                    event.get("error"),
                    message_id,
                )

            elif event_type == "error":
                self.emitter.emit_error(event.get("error", "Unknown error"), message_id)

            if on_event:
                on_event(event)

        except json.JSONDecodeError:
            # Not JSON, might be raw output - emit as token
            self.emitter.emit_token(line, message_id)

    def stop(self) -> None:
        """Stop the running process."""
        self._stop_requested = True
        if self.process:
            self.process.terminate()
            # Give it a moment to terminate gracefully
            time.sleep(0.5)
            if self.process.poll() is None:
                self.process.kill()
