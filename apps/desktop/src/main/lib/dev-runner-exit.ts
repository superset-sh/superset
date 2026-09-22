/**
 * Dev-only exit handling for the main process under electron-vite.
 *
 * In development the process is a child of electron-vite (and of turbo above
 * it), which owns its lifetime and its stdout/stderr pipes. Electron does not
 * quit on its own when that runner goes away, so three signals are treated as
 * "the runner is gone, exit now":
 *
 * - SIGTERM / SIGINT forwarded by the runner on a normal stop.
 * - The parent pid disappearing, for runners that exit without signalling.
 * - EPIPE on stdout/stderr: the pipe reader died. Without a listener that
 *   error surfaces as an uncaughtException, whose logging writes to the same
 *   dead pipe and throws again, an unbounded loop that pins a core until
 *   someone kills the process.
 *
 * Extracted from `main/index.ts` so the sequencing can be tested without
 * booting the main process.
 */

export const DEV_EXIT_DEADLINE_MS = 5_000;
export const DEV_PARENT_POLL_MS = 1_000;

export type DevExitReason =
	| "SIGTERM"
	| "SIGINT"
	| "parent-exit"
	| "stdio-closed";

interface ErrorSource {
	on(event: "error", listener: (error: NodeJS.ErrnoException) => void): unknown;
}

export interface DevRunnerExitDeps {
	parentPid: number;
	stdio: ErrorSource[];
	subscribeSignal: (signal: "SIGTERM" | "SIGINT", handler: () => void) => void;
	/** Flip the main-process quitting flag so exception handlers stop logging. */
	markQuitting: () => void;
	stopHostServices: () => void;
	teardownTerminalHost: () => Promise<void>;
	exit: (code: number) => void;
	isProcessAlive?: (pid: number) => boolean;
	scheduleTimer?: (callback: () => void, delayMs: number) => void;
	/** Returns a function that stops the interval. */
	scheduleInterval?: (callback: () => void, intervalMs: number) => () => void;
	log?: (message: string) => void;
}

export function installDevRunnerExit(deps: DevRunnerExitDeps): void {
	const {
		parentPid,
		stdio,
		subscribeSignal,
		markQuitting,
		stopHostServices,
		teardownTerminalHost,
		exit,
		isProcessAlive = defaultIsProcessAlive,
		scheduleTimer = (callback, delayMs) => {
			setTimeout(callback, delayMs);
		},
		scheduleInterval = defaultScheduleInterval,
		log = (message) => console.log(message),
	} = deps;

	let quitting = false;
	let exited = false;
	const exitOnce = (message: string) => {
		if (exited) return;
		exited = true;
		log(message);
		exit(0);
	};

	const quit = (reason: DevExitReason) => {
		if (quitting) return;
		quitting = true;
		markQuitting();
		log(`[main] Received ${reason}, quitting...`);
		// Teardown can hang on a dead daemon socket; never let that keep an
		// orphaned dev Electron alive.
		scheduleTimer(
			() => exitOnce("[main] Teardown deadline reached, exiting"),
			DEV_EXIT_DEADLINE_MS,
		);
		stopHostServices();
		void Promise.allSettled([teardownTerminalHost()]).finally(() =>
			exitOnce("[main] Teardown complete, exiting"),
		);
	};

	subscribeSignal("SIGTERM", () => quit("SIGTERM"));
	subscribeSignal("SIGINT", () => quit("SIGINT"));

	for (const stream of stdio) {
		stream.on("error", (error) => {
			if (error.code === "EPIPE") quit("stdio-closed");
		});
	}

	const stopPolling = scheduleInterval(() => {
		if (isProcessAlive(parentPid)) return;
		stopPolling();
		log("[main] Parent process exited, quitting...");
		quit("parent-exit");
	}, DEV_PARENT_POLL_MS);
}

function defaultIsProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function defaultScheduleInterval(
	callback: () => void,
	intervalMs: number,
): () => void {
	const interval = setInterval(callback, intervalMs);
	interval.unref();
	return () => clearInterval(interval);
}
