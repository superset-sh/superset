/**
 * Terminal Attach Scheduler
 *
 * Manages concurrent terminal attach operations with:
 * - Concurrency limit (max 3 simultaneous attaches)
 * - Priority ordering (focused terminals attach first)
 * - StrictMode double-mount handling
 * - Idempotent completion (safe to call done() multiple times)
 */

type TaskState = "queued" | "running" | "waiting" | "completed" | "canceled";

type AttachTask = {
	paneId: string;
	priority: number;
	enqueuedAt: number;
	state: TaskState;
	run: (done: () => void) => void;
};

const MAX_CONCURRENT_ATTACHES = 3;

const DEBUG_SCHEDULER =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

let inFlight = 0;
const queue: AttachTask[] = [];

// Single source of truth for all tasks, keyed by paneId
const tasks = new Map<string, AttachTask>();

function log(message: string, data?: Record<string, unknown>) {
	if (!DEBUG_SCHEDULER) return;
	console.log(`[AttachScheduler] ${message}`, data ?? "");
}

function pump(): void {
	while (inFlight < MAX_CONCURRENT_ATTACHES && queue.length > 0) {
		queue.sort(
			(a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt,
		);
		const task = queue.shift();
		if (!task) return;

		// Skip canceled or completed tasks
		if (task.state === "canceled" || task.state === "completed") {
			log(`Skipping ${task.state} task: ${task.paneId}`);
			continue;
		}

		// Skip if a newer task replaced this one
		if (tasks.get(task.paneId) !== task) {
			log(`Skipping replaced task: ${task.paneId}`);
			continue;
		}

		// If another task is running for this paneId, wait for it
		const currentTask = tasks.get(task.paneId);
		if (
			currentTask &&
			currentTask !== task &&
			currentTask.state === "running"
		) {
			log(`Waiting for previous task: ${task.paneId}`);
			task.state = "waiting";
			continue;
		}

		// Start the task
		inFlight++;
		task.state = "running";
		log(`Starting task: ${task.paneId}`, {
			inFlight,
			queueLength: queue.length,
		});

		task.run(() => completeTask(task));
	}

	if (DEBUG_SCHEDULER && queue.length > 0) {
		log(`pump() exited with tasks waiting`, {
			queueLength: queue.length,
			inFlight,
		});
	}
}

function completeTask(task: AttachTask): void {
	// Idempotent: only complete once
	if (task.state === "completed" || task.state === "canceled") {
		log(`Task already ${task.state}: ${task.paneId}`);
		return;
	}

	const wasRunning = task.state === "running";
	task.state = "completed";

	log(`Task done: ${task.paneId}`, {
		wasRunning,
		inFlight: wasRunning ? inFlight - 1 : inFlight,
	});

	// Clean up if this is still the current task for this paneId
	if (tasks.get(task.paneId) === task) {
		tasks.delete(task.paneId);
	}

	// Re-queue any waiting task for this paneId
	for (const t of queue) {
		if (t.paneId === task.paneId && t.state === "waiting") {
			t.state = "queued";
			log(`Re-queued waiting task: ${task.paneId}`);
			break;
		}
	}

	if (wasRunning) {
		inFlight = Math.max(0, inFlight - 1);
	}
	pump();
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
	log(`Schedule: ${paneId}`, { priority, inFlight, queueLength: queue.length });

	// Cancel any existing task for this paneId
	const existing = tasks.get(paneId);
	if (
		existing &&
		existing.state !== "completed" &&
		existing.state !== "canceled"
	) {
		existing.state = "canceled";
		log(`Canceled existing task: ${paneId}`);
	}

	const task: AttachTask = {
		paneId,
		priority,
		enqueuedAt: Date.now(),
		state: "queued",
		run,
	};

	tasks.set(paneId, task);
	queue.push(task);
	pump();

	return () => {
		// Skip if already done
		if (task.state === "completed" || task.state === "canceled") {
			return;
		}

		const wasRunning = task.state === "running";
		task.state = "canceled";

		log(`Cancel: ${paneId}`, {
			wasRunning,
			inFlight: wasRunning ? inFlight - 1 : inFlight,
		});

		// Clean up if this is still the current task
		if (tasks.get(paneId) === task) {
			tasks.delete(paneId);
		}

		// Re-queue any waiting task
		for (const t of queue) {
			if (t.paneId === paneId && t.state === "waiting") {
				t.state = "queued";
				log(`Re-queued waiting task after cancel: ${paneId}`);
				break;
			}
		}

		if (wasRunning) {
			inFlight = Math.max(0, inFlight - 1);
			pump();
		}
	};
}
