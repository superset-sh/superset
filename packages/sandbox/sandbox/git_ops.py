"""Git operations for sandbox environment."""

import os
import shutil
import subprocess
from pathlib import Path

from .config import SandboxConfig, WORKSPACE_ROOT, GIT_CLONE_TIMEOUT_SECONDS
from .events import EventEmitter


class GitOperations:
    """Handles git operations within the sandbox."""

    def __init__(self, config: SandboxConfig, emitter: EventEmitter):
        self.config = config
        self.emitter = emitter
        self.workspace_path = Path(WORKSPACE_ROOT) / config.repo_name

    def _run_git(self, args: list[str], cwd: Path | None = None, timeout: int | None = None) -> subprocess.CompletedProcess:
        """Run a git command."""
        cmd = ["git"] + args
        return subprocess.run(
            cmd,
            cwd=cwd or self.workspace_path,
            capture_output=True,
            text=True,
            timeout=timeout or 60,
        )

    def clone_repo(self, github_token: str) -> bool:
        """Clone the repository."""
        self.emitter.emit_git_sync("cloning")

        # Clean up existing workspace directory if it exists
        if self.workspace_path.exists():
            try:
                shutil.rmtree(self.workspace_path)
            except Exception as e:
                self.emitter.emit_error(f"Failed to clean workspace: {str(e)}")
                return False

        # Construct clone URL with token
        clone_url = f"https://x-access-token:{github_token}@github.com/{self.config.repo_owner}/{self.config.repo_name}.git"

        try:
            result = self._run_git(
                ["clone", "--depth", "100", clone_url, str(self.workspace_path)],
                cwd=Path(WORKSPACE_ROOT),
                timeout=GIT_CLONE_TIMEOUT_SECONDS,
            )

            if result.returncode != 0:
                self.emitter.emit_error(f"Git clone failed: {result.stderr}")
                return False

            self.emitter.emit_git_sync("cloned", {"repo": f"{self.config.repo_owner}/{self.config.repo_name}"})
            return True

        except subprocess.TimeoutExpired:
            self.emitter.emit_error("Git clone timed out")
            return False
        except Exception as e:
            self.emitter.emit_error(f"Git clone error: {str(e)}")
            return False

    def checkout_branch(self) -> bool:
        """Checkout or create the working branch."""
        self.emitter.emit_git_sync("checking_out", {"branch": self.config.branch})

        try:
            # Fetch the base branch first
            result = self._run_git(["fetch", "origin", self.config.base_branch])
            if result.returncode != 0:
                self.emitter.emit_error(f"Failed to fetch base branch: {result.stderr}")
                return False

            # Check if branch exists remotely
            result = self._run_git(["ls-remote", "--heads", "origin", self.config.branch])

            if self.config.branch in result.stdout:
                # Branch exists, checkout and pull
                result = self._run_git(["checkout", self.config.branch])
                if result.returncode != 0:
                    # Try creating local tracking branch
                    result = self._run_git(["checkout", "-b", self.config.branch, f"origin/{self.config.branch}"])
                if result.returncode == 0:
                    self._run_git(["pull", "origin", self.config.branch])
            else:
                # Create new branch from base
                result = self._run_git(["checkout", "-b", self.config.branch, f"origin/{self.config.base_branch}"])

            if result.returncode != 0:
                self.emitter.emit_error(f"Failed to checkout branch: {result.stderr}")
                return False

            self.emitter.emit_git_sync("checked_out", {"branch": self.config.branch})
            return True

        except Exception as e:
            self.emitter.emit_error(f"Checkout error: {str(e)}")
            return False

    def configure_user(self) -> None:
        """Configure git user for commits."""
        name = self.config.git_user_name or "Superset Bot"
        email = self.config.git_user_email or "bot@superset.sh"

        self._run_git(["config", "user.name", name])
        self._run_git(["config", "user.email", email])

    def get_status(self) -> dict:
        """Get current git status."""
        result = self._run_git(["status", "--porcelain"])
        changed_files = [line.strip() for line in result.stdout.splitlines() if line.strip()]

        result = self._run_git(["rev-parse", "HEAD"])
        current_sha = result.stdout.strip() if result.returncode == 0 else None

        result = self._run_git(["branch", "--show-current"])
        current_branch = result.stdout.strip() if result.returncode == 0 else None

        return {
            "branch": current_branch,
            "sha": current_sha,
            "changed_files": changed_files,
            "has_changes": len(changed_files) > 0,
        }

    def push_changes(self) -> bool:
        """Push local changes to remote."""
        status = self.get_status()
        if not status["has_changes"]:
            return True

        self.emitter.emit_git_sync("pushing")

        try:
            # Add all changes
            result = self._run_git(["add", "-A"])
            if result.returncode != 0:
                self.emitter.emit_error(f"Git add failed: {result.stderr}")
                return False

            # Commit
            result = self._run_git(["commit", "-m", "Changes from Superset cloud workspace"])
            if result.returncode != 0:
                self.emitter.emit_error(f"Git commit failed: {result.stderr}")
                return False

            # Push
            result = self._run_git(["push", "origin", self.config.branch])
            if result.returncode != 0:
                self.emitter.emit_error(f"Git push failed: {result.stderr}")
                return False

            self.emitter.emit_git_sync("pushed", {"branch": self.config.branch})
            return True

        except Exception as e:
            self.emitter.emit_error(f"Push error: {str(e)}")
            return False
