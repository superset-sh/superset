import { performance } from "node:perf_hooks";
import { recordTransientErrorInWindow } from "./transient-error-window";

type LogFn = (
	level: "info" | "warn" | "error",
	message: string,
	data?: unknown,
) => void;

interface SetupSignalHandlersOptions {
	log: LogFn;
	stopServer: () => Promise<void>;
}

interface ShutdownOptions {
	exitCode: 0 | 1;
	message?: string;
	stopServerErrorMessage: string;
	timeoutMessage: string;
}

/**
 * Error codes for transient OS-level errors that should not kill the daemon.
 *
 * ENOSPC - disk full (temporary, user may free space)
 * ENOMEM - out of memory (temporary, other processes may release)
 * EMFILE - too many open files per-process
 * ENFILE - too many open files system-wide
 *
 * These errors are typically momentary. Crashing the daemon on a transient
 * error destroys all active terminal sessions, which is far more disruptive
 * than the original error itself.
 */
const TRANSIENT_ERROR_CODES = ["ENOSPC", "ENOMEM", "EMFILE", "ENFILE"];

/** After this many transient errors inside the sliding window, shut down. */
const MAX_TRANSIENT_ERRORS = 50;
/** Sliding window duration for transient error rate limiting. */
const TRANSIENT_ERROR_WINDOW_MS = 60_000;
const TRANSIENT_ERROR_WINDOW_SECONDS = Math.floor(
	TRANSIENT_ERROR_WINDOW_MS / 1000,
);
const SHUTDOWN_TIMEOUT_MS = 10_000;

function isTransientError(error: unknown): boolean {
	if (error instanceof Error) {
		return TRANSIENT_ERROR_CODES.some(
			(code) =>
				error.message.includes(code) ||
				(error as NodeJS.ErrnoException).code === code,
		);
	}
	return false;
}

function getTransientErrorIdentifier(error: unknown): string {
	if (error instanceof Error) {
		const code = (error as NodeJS.ErrnoException).code;
		return code ?? error.message.split(",")[0];
	}
	return "unknown";
}

export function setupTerminalHostSignalHandlers({
	log,
	stopServer,
}: SetupSignalHandlersOptions): void {
	const transientErrorTimestamps: number[] = [];
	let isShuttingDown = false;
	let forceExitTimer: NodeJS.Timeout | null = null;

	const clearForceExitTimer = () => {
		if (!forceExitTimer) return;
		clearTimeout(forceExitTimer);
		forceExitTimer = null;
	};

	const shutdownOnce = ({
		exitCode,
		message,
		stopServerErrorMessage,
		timeoutMessage,
	}: ShutdownOptions) => {
		if (isShuttingDown) return;
		isShuttingDown = true;

		// Ensure we always terminate even if cleanup hangs.
		forceExitTimer = setTimeout(() => {
			try {
				log("error", timeoutMessage);
			} finally {
				process.exit(exitCode);
			}
		}, SHUTDOWN_TIMEOUT_MS);

		if (message) {
			try {
				log(exitCode === 0 ? "info" : "error", message);
			} catch {
				// Continue shutdown if logging itself fails.
			}
		}

		stopServer()
			.catch((error) => {
				log("error", stopServerErrorMessage, { error });
			})
			.finally(() => {
				clearForceExitTimer();
				process.exit(exitCode);
			});
	};

	process.on("SIGINT", () => {
		shutdownOnce({
			exitCode: 0,
			message: "Received SIGINT, shutting down...",
			stopServerErrorMessage: "Error during stopServer in SIGINT shutdown",
			timeoutMessage: "Forced exit after SIGINT shutdown timeout",
		});
	});
	process.on("SIGTERM", () => {
		shutdownOnce({
			exitCode: 0,
			message: "Received SIGTERM, shutting down...",
			stopServerErrorMessage: "Error during stopServer in SIGTERM shutdown",
			timeoutMessage: "Forced exit after SIGTERM shutdown timeout",
		});
	});
	process.on("SIGHUP", () => {
		shutdownOnce({
			exitCode: 0,
			message: "Received SIGHUP, shutting down...",
			stopServerErrorMessage: "Error during stopServer in SIGHUP shutdown",
			timeoutMessage: "Forced exit after SIGHUP shutdown timeout",
		});
	});

	process.on("uncaughtException", (error) => {
		if (isShuttingDown) return;

		if (isTransientError(error)) {
			const transientErrorCount = recordTransientErrorInWindow(
				transientErrorTimestamps,
				performance.now(),
				TRANSIENT_ERROR_WINDOW_MS,
			);
			log(
				"warn",
				`Transient uncaught error #${transientErrorCount}/${MAX_TRANSIENT_ERRORS} ` +
					`in last ${TRANSIENT_ERROR_WINDOW_SECONDS}s ` +
					`(${getTransientErrorIdentifier(error)}), ` +
					`keeping sessions alive`,
			);
			if (transientErrorCount >= MAX_TRANSIENT_ERRORS) {
				shutdownOnce({
					exitCode: 1,
					message: `Too many transient errors in ${TRANSIENT_ERROR_WINDOW_SECONDS}s window, shutting down`,
					stopServerErrorMessage:
						"Error during stopServer in fatal error shutdown",
					timeoutMessage: "Forced exit after fatal error shutdown timeout",
				});
			}
			return;
		}

		log("error", "Uncaught exception", {
			error: error.message,
			stack: error.stack,
		});
		shutdownOnce({
			exitCode: 1,
			stopServerErrorMessage: "Error during stopServer in fatal shutdown",
			timeoutMessage: "Forced exit after shutdown timeout",
		});
	});

	process.on("unhandledRejection", (reason) => {
		if (isShuttingDown) return;

		if (isTransientError(reason)) {
			const transientErrorCount = recordTransientErrorInWindow(
				transientErrorTimestamps,
				performance.now(),
				TRANSIENT_ERROR_WINDOW_MS,
			);
			log(
				"warn",
				`Transient unhandled rejection #${transientErrorCount}/${MAX_TRANSIENT_ERRORS}, ` +
					`in last ${TRANSIENT_ERROR_WINDOW_SECONDS}s, ` +
					`(${getTransientErrorIdentifier(reason)}), ` +
					`keeping sessions alive`,
			);
			if (transientErrorCount >= MAX_TRANSIENT_ERRORS) {
				shutdownOnce({
					exitCode: 1,
					message: `Too many transient rejections in ${TRANSIENT_ERROR_WINDOW_SECONDS}s window (${transientErrorCount}/${MAX_TRANSIENT_ERRORS}), shutting down`,
					stopServerErrorMessage:
						"Error during stopServer in fatal rejection shutdown",
					timeoutMessage: "Forced exit after fatal rejection shutdown timeout",
				});
			}
			return;
		}

		log("error", "Unhandled rejection", { reason });
		shutdownOnce({
			exitCode: 1,
			stopServerErrorMessage: "Error during stopServer in fatal shutdown",
			timeoutMessage: "Forced exit after shutdown timeout",
		});
	});
}
