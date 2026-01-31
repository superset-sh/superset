# Copyright Modal Labs 2022
#
# This module provides a simple interface for creating GPU memory snapshots,
# providing a convenient interface to `cuda-checkpoint` [1]. This is intended
# to be used in conjunction with memory snapshots.
#
# [1] https://github.com/NVIDIA/cuda-checkpoint

import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import List, Optional

from modal.config import config, logger

CUDA_CHECKPOINT_PATH: str = config.get("cuda_checkpoint_path")

# Maximum total duration for each individual `cuda-checkpoint` invocation.
CUDA_CHECKPOINT_TIMEOUT: float = 3 * 60.0

# Number of retries for each individual `cuda-checkpoint --toggle` invocation.
CUDA_CHECKPOINT_TOGGLE_NUM_RETRIES: int = 3

# Maximum total duration for an entire toggle operation.
CUDA_CHECKPOINT_TOGGLE_TIMEOUT: float = CUDA_CHECKPOINT_TOGGLE_NUM_RETRIES * CUDA_CHECKPOINT_TIMEOUT


class CudaCheckpointState(Enum):
    """State representation from the CUDA API [1].

    [1] https://docs.nvidia.com/cuda/cuda-driver-api/group__CUDA__TYPES.html"""

    RUNNING = "running"
    LOCKED = "locked"
    CHECKPOINTED = "checkpointed"
    FAILED = "failed"


class CudaCheckpointException(Exception):
    """Exception raised for CUDA checkpoint operations."""

    pass


@dataclass
class CudaCheckpointProcess:
    """Contains a reference to a PID with active CUDA session. This also provides
    methods for checkpointing and restoring GPU memory."""

    pid: int
    state: CudaCheckpointState

    def toggle(self, target_state: CudaCheckpointState, skip_first_refresh: bool = False) -> None:
        """Toggle CUDA checkpoint state for current process, moving GPU memory to the
        CPU and back depending on the current process state when called.
        """
        logger.debug(f"PID: {self.pid} Toggling CUDA checkpoint state to {target_state.value}")

        start_time = time.monotonic()
        retry_count = 0
        max_retries = CUDA_CHECKPOINT_TOGGLE_NUM_RETRIES

        attempts = 0
        while self._should_continue_toggle(
            target_state, start_time, refresh=not (skip_first_refresh and attempts == 0)
        ):
            attempts += 1
            try:
                self._execute_toggle_command()
                # Use exponential backoff for retries
                sleep_time = min(0.1 * (2**retry_count), 1.0)
                time.sleep(sleep_time)
                retry_count = 0
            except CudaCheckpointException as e:
                retry_count += 1
                if retry_count >= max_retries:
                    raise CudaCheckpointException(
                        f"PID: {self.pid} Failed to toggle state after {max_retries} retries: {e}"
                    )
                logger.debug(f"PID: {self.pid} Retry {retry_count}/{max_retries} after error: {e}")
                time.sleep(0.5 * retry_count)

        logger.debug(f"PID: {self.pid} Target state {target_state.value} reached")

    def _should_continue_toggle(
        self, target_state: CudaCheckpointState, start_time: float, refresh: bool = True
    ) -> bool:
        """Check if toggle operation should continue based on current state and timeout."""
        if refresh:
            self.refresh_state()

        if self.state == target_state:
            return False

        if self.state == CudaCheckpointState.FAILED:
            raise CudaCheckpointException(f"PID: {self.pid} CUDA process state is {self.state}")

        elapsed = time.monotonic() - start_time
        if elapsed >= CUDA_CHECKPOINT_TOGGLE_TIMEOUT:
            raise CudaCheckpointException(
                f"PID: {self.pid} Timeout after {elapsed:.2f}s waiting for state {target_state.value}. "
                f"Current state: {self.state}"
            )

        return True

    def _execute_toggle_command(self) -> None:
        """Execute the cuda-checkpoint toggle command."""
        try:
            _ = subprocess.run(
                [CUDA_CHECKPOINT_PATH, "--toggle", "--pid", str(self.pid)],
                check=True,
                capture_output=True,
                text=True,
                timeout=CUDA_CHECKPOINT_TIMEOUT,
            )
            logger.debug(f"PID: {self.pid} Successfully toggled CUDA checkpoint state")
        except subprocess.CalledProcessError as e:
            error_msg = f"PID: {self.pid} Failed to toggle CUDA checkpoint state: {e.stderr}"
            logger.debug(error_msg)
            raise CudaCheckpointException(error_msg)
        except subprocess.TimeoutExpired:
            error_msg = f"PID: {self.pid} Toggle command timed out"
            logger.debug(error_msg)
            raise CudaCheckpointException(error_msg)

    def refresh_state(self) -> None:
        """Refreshes the current CUDA checkpoint state for this process."""
        try:
            result = subprocess.run(
                [CUDA_CHECKPOINT_PATH, "--get-state", "--pid", str(self.pid)],
                check=True,
                capture_output=True,
                text=True,
                timeout=CUDA_CHECKPOINT_TIMEOUT,
            )

            state_str = result.stdout.strip().lower()
            self.state = CudaCheckpointState(state_str)

        except subprocess.CalledProcessError as e:
            error_msg = f"PID: {self.pid} Failed to get CUDA checkpoint state: {e.stderr}"
            logger.debug(error_msg)
            raise CudaCheckpointException(error_msg)
        except subprocess.TimeoutExpired:
            error_msg = f"PID: {self.pid} Get state command timed out"
            logger.debug(error_msg)
            raise CudaCheckpointException(error_msg)


class CudaCheckpointSession:
    """Manages the checkpointing state of processes with active CUDA sessions."""

    def __init__(self):
        self.cuda_processes = self._get_cuda_pids()
        if self.cuda_processes:
            logger.debug(
                f"Found {len(self.cuda_processes)} PID(s) with CUDA sessions: {[c.pid for c in self.cuda_processes]}"
            )
        else:
            logger.debug("No CUDA sessions found.")

    def _get_cuda_pids(self) -> List[CudaCheckpointProcess]:
        """Iterates over all PIDs and identifies the ones that have running
        CUDA sessions."""
        cuda_pids: List[CudaCheckpointProcess] = []

        # Get all active process IDs from /proc directory
        proc_dir = Path("/proc")
        if not proc_dir.exists():
            raise CudaCheckpointException(
                "OS does not have /proc path rendering it incompatible with GPU memory snapshots."
            )

        # Get all numeric directories (PIDs) from /proc
        pid_dirs = [entry for entry in proc_dir.iterdir() if entry.name.isdigit()]

        # Use ThreadPoolExecutor to check PIDs in parallel for better performance
        with ThreadPoolExecutor(max_workers=min(50, len(pid_dirs))) as executor:
            future_to_pid = {
                executor.submit(self._check_cuda_session, int(entry.name)): int(entry.name) for entry in pid_dirs
            }

            for future in as_completed(future_to_pid):
                pid = future_to_pid[future]
                try:
                    cuda_process = future.result()
                    if cuda_process:
                        cuda_pids.append(cuda_process)
                except Exception as e:
                    logger.debug(f"Error checking PID {pid}: {e}")

        # Sort PIDs for ordered checkpointing
        cuda_pids.sort(key=lambda x: x.pid)
        return cuda_pids

    def _check_cuda_session(self, pid: int) -> Optional[CudaCheckpointProcess]:
        """Check if a specific PID has a CUDA session."""
        try:
            result = subprocess.run(
                [CUDA_CHECKPOINT_PATH, "--get-state", "--pid", str(pid)],
                capture_output=True,
                text=True,
                timeout=CUDA_CHECKPOINT_TIMEOUT,
            )

            # If the command succeeds (return code 0), this PID has a CUDA session
            if result.returncode == 0:
                state_str = result.stdout.strip().lower()
                state = CudaCheckpointState(state_str)
                return CudaCheckpointProcess(pid=pid, state=state)

        except subprocess.CalledProcessError:
            # Command failed, which is expected for PIDs without CUDA sessions
            pass
        except subprocess.TimeoutExpired:
            logger.debug(f"Timeout checking CUDA state for PID {pid}")
        except Exception as e:
            logger.debug(f"Error checking PID {pid}: {e}")

        return None

    def checkpoint(self) -> None:
        """Checkpoint all CUDA processes, moving GPU memory to CPU."""
        if not self.cuda_processes:
            logger.debug("No CUDA processes to checkpoint.")
            return

        # Validate all states first
        for proc in self.cuda_processes:
            proc.refresh_state()  # Refresh state before validation
            if proc.state != CudaCheckpointState.RUNNING:
                raise CudaCheckpointException(
                    f"PID {proc.pid}: CUDA session not in {CudaCheckpointState.RUNNING.value} state. "
                    f"Current state: {proc.state.value}"
                )

        # Moving state from GPU to CPU can take several seconds per CUDA session.
        # Make a parallel call per CUDA session.
        start = time.perf_counter()

        def checkpoint_impl(proc: CudaCheckpointProcess) -> None:
            proc.toggle(CudaCheckpointState.CHECKPOINTED)

        with ThreadPoolExecutor() as executor:
            futures = [executor.submit(checkpoint_impl, proc) for proc in self.cuda_processes]

            # Wait for all futures and collect any exceptions
            exceptions = []
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    exceptions.append(e)

            if exceptions:
                raise CudaCheckpointException(
                    f"Failed to checkpoint {len(exceptions)} processes: {'; '.join(str(e) for e in exceptions)}"
                )

        elapsed = time.perf_counter() - start
        logger.debug(f"Checkpointing {len(self.cuda_processes)} CUDA sessions took => {elapsed:.3f}s")

    def restore(self) -> None:
        """Restore all CUDA processes, moving memory back from CPU to GPU."""
        if not self.cuda_processes:
            logger.debug("No CUDA sessions to restore.")
            return

        # See checkpoint() for rationale about parallelism.
        start = time.perf_counter()

        def restore_process(proc: CudaCheckpointProcess) -> None:
            proc.toggle(CudaCheckpointState.RUNNING, skip_first_refresh=True)

        with ThreadPoolExecutor() as executor:
            futures = [executor.submit(restore_process, proc) for proc in self.cuda_processes]

            # Wait for all futures and collect any exceptions
            exceptions = []
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    exceptions.append(e)

            if exceptions:
                raise CudaCheckpointException(
                    f"Failed to restore {len(exceptions)} processes: {'; '.join(str(e) for e in exceptions)}"
                )

        elapsed = time.perf_counter() - start
        logger.debug(f"Restoring {len(self.cuda_processes)} CUDA session(s) took => {elapsed:.3f}s")

    def get_process_count(self) -> int:
        """Get the number of CUDA processes managed by this session."""
        return len(self.cuda_processes)

    def get_process_states(self) -> List[tuple[int, CudaCheckpointState]]:
        """Get current states of all managed processes."""
        states = []
        for proc in self.cuda_processes:
            proc.refresh_state()
            states.append((proc.pid, proc.state))
        return states
