type AttachTask = {
	paneId: string;
	priority: number;
	enqueuedAt: number;
	canceled: boolean;
	/** Whether this task has released its inFlight slot (idempotent completion) */
	released: boolean;
	run: (done: () => void) => void;
};

const MAX_CONCURRENT_ATTACHES = 3;

// Debug logging (enable via localStorage.setItem('SUPERSET_TERMINAL_DEBUG', '1'))
const DEBUG_SCHEDULER =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

let inFlight = 0;
const queue: AttachTask[] = [];
const pendingByPaneId = new Map<string, AttachTask>();

// Track running tasks per paneId to prevent StrictMode double-runs exhausting concurrency
const runningByPaneId = new Map<string, AttachTask>();

// Tasks waiting for a running task to complete (stored separately to avoid infinite loop)
const waitingByPaneId = new Map<string, AttachTask>();

function pump(): void {
	while (inFlight < MAX_CONCURRENT_ATTACHES && queue.length > 0) {
		// Pick highest priority (lowest number), FIFO within same priority.
		queue.sort(
			(a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt,
		);
		const task = queue.shift();
		if (!task) return;
		if (task.canceled) {
			if (DEBUG_SCHEDULER) {
				console.log(`[AttachScheduler] Skipping canceled task: ${task.paneId}`);
			}
			continue;
		}

		// If a newer task replaced this paneId, skip this stale one.
		const current = pendingByPaneId.get(task.paneId);
		if (current !== task) {
			if (DEBUG_SCHEDULER) {
				console.log(`[AttachScheduler] Skipping replaced task: ${task.paneId}`);
			}
			continue;
		}

		// If there's already a running task for this paneId (from a previous mount
		// that was canceled but still executing), wait for it to finish before
		// starting a new one. This prevents StrictMode double-mounts from
		// exhausting the concurrency limit.
		const running = runningByPaneId.get(task.paneId);
		if (running && running !== task) {
			if (DEBUG_SCHEDULER) {
				console.log(
					`[AttachScheduler] Waiting for previous task to finish: ${task.paneId}, inFlight=${inFlight}`,
				);
			}
			// Store in waiting map (NOT back in queue to avoid infinite loop).
			// Will be re-queued when the running task completes.
			waitingByPaneId.set(task.paneId, task);
			continue;
		}

		inFlight++;
		runningByPaneId.set(task.paneId, task);

		if (DEBUG_SCHEDULER) {
			console.log(
				`[AttachScheduler] Starting task: ${task.paneId}, inFlight=${inFlight}, queueLength=${queue.length}`,
			);
		}

		task.run(() => {
			// Idempotent completion: only release inFlight slot once
			// This prevents double-decrement when cancel() was called while task was running
			const shouldRelease = !task.released;
			if (shouldRelease) {
				task.released = true;
			}

			if (DEBUG_SCHEDULER) {
				console.log(
					`[AttachScheduler] Task done: ${task.paneId}, inFlight=${shouldRelease ? inFlight - 1 : inFlight}, alreadyReleased=${!shouldRelease}`,
				);
			}

			// Clear running tracker
			if (runningByPaneId.get(task.paneId) === task) {
				runningByPaneId.delete(task.paneId);
			}

			// Only clear pending if this task is still the current one for the paneId.
			if (pendingByPaneId.get(task.paneId) === task) {
				pendingByPaneId.delete(task.paneId);
			}

			// Re-queue any task that was waiting for this one to complete
			const waiting = waitingByPaneId.get(task.paneId);
			if (waiting && !waiting.canceled) {
				waitingByPaneId.delete(task.paneId);
				queue.push(waiting);
				if (DEBUG_SCHEDULER) {
					console.log(
						`[AttachScheduler] Re-queued waiting task: ${task.paneId}`,
					);
				}
			}

			// Only decrement inFlight if we're the one releasing
			if (shouldRelease) {
				inFlight = Math.max(0, inFlight - 1);
			}
			pump();
		});
	}

	if (DEBUG_SCHEDULER && queue.length > 0) {
		console.log(
			`[AttachScheduler] pump() exited with ${queue.length} tasks waiting, inFlight=${inFlight}`,
		);
	}
}

export function scheduleTerminalAttach({
	paneId,
	priority,
	run,
}: {
	paneId: string;
	priority: number;
	run: (done: () => void) => void;
}): () => void {
	if (DEBUG_SCHEDULER) {
		console.log(
			`[AttachScheduler] Schedule: ${paneId}, priority=${priority}, inFlight=${inFlight}, queueLength=${queue.length}`,
		);
	}

	// Replace any existing pending task for this paneId.
	const existing = pendingByPaneId.get(paneId);
	if (existing) {
		existing.canceled = true;
		pendingByPaneId.delete(paneId);
		if (DEBUG_SCHEDULER) {
			console.log(
				`[AttachScheduler] Canceled existing pending task: ${paneId}`,
			);
		}
	}

	const task: AttachTask = {
		paneId,
		priority,
		enqueuedAt: Date.now(),
		canceled: false,
		released: false,
		run,
	};

	pendingByPaneId.set(paneId, task);
	queue.push(task);
	pump();

	return () => {
		task.canceled = true;
		if (pendingByPaneId.get(paneId) === task) {
			pendingByPaneId.delete(paneId);
		}
		if (waitingByPaneId.get(paneId) === task) {
			waitingByPaneId.delete(paneId);
		}

		// If this task is currently running, we need to decrement inFlight now
		// because the tRPC callbacks for unmounted components may not fire,
		// meaning done() would never be called and inFlight would stay stuck.
		// Use idempotent release to prevent double-decrement if done() also fires.
		if (runningByPaneId.get(paneId) === task && !task.released) {
			task.released = true;
			runningByPaneId.delete(paneId);
			inFlight = Math.max(0, inFlight - 1);
			if (DEBUG_SCHEDULER) {
				console.log(
					`[AttachScheduler] Cancel running task: ${paneId}, inFlight=${inFlight}`,
				);
			}
			// Re-queue any task that was waiting for this one to complete
			// (mirrors done() behavior for the "done never fires" scenario)
			const waiting = waitingByPaneId.get(paneId);
			if (waiting && !waiting.canceled) {
				waitingByPaneId.delete(paneId);
				queue.push(waiting);
				if (DEBUG_SCHEDULER) {
					console.log(
						`[AttachScheduler] Re-queued waiting task after cancel: ${paneId}`,
					);
				}
			}
			// Pump to start any waiting tasks now that we have capacity
			pump();
		} else if (DEBUG_SCHEDULER) {
			console.log(`[AttachScheduler] Cancel called: ${paneId}`);
		}
	};
}
