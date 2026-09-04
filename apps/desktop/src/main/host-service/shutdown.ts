/**
 * Shutdown sequencing for the host-service child.
 *
 * Extracted from `index.ts` (which boots Sentry, the DB and the HTTP server at
 * import time) so the wedged-worker path can be exercised in a unit test.
 *
 * Why this exists: on a Squirrel.Mac auto-update the Electron parent quits
 * seconds after `before-quit`, so the child is left to terminate itself. The
 * old sequence ended in `process.exit(0)`, which joins every `worker_threads`
 * Worker before the process can die. A host-worker wedged in native code (a
 * hung `spawnSync` git, a long SQLite call) blocks that join forever, and the
 * child becomes a PPID-1 orphan pinned at ~100% CPU that ignores every further
 * SIGTERM. Its open pty-daemon socket then freezes terminals for the live
 * host-service too. The fix: dispose the app under a deadline, and past it
 * hard-exit with a kernel-delivered SIGKILL that needs no cooperation from V8.
 */

/** In-flight HTTP gets this long to finish before sockets are torn down. */
export const SHUTDOWN_GRACE_MS = 3_000;

/** How long `dispose()` (workers, SQLite, watchers) may take before SIGKILL. */
export const DISPOSE_TIMEOUT_MS = 2_000;

export interface ShutdownServer {
	close: () => unknown;
	/** SSE/WS streams ignore `close()`; this tears them down. */
	closeAllConnections?: () => void;
}

export interface ShutdownDeps {
	/** Null before `serve()` has returned; shutdown then just exits. */
	getServer: () => ShutdownServer | null;
	/** Null before `createApp()` has run; nothing to dispose yet. */
	getDispose: () => (() => Promise<void>) | null;
	/**
	 * A reclaim tick during the drain window would resurrect the manifest the
	 * coordinator just removed, leaving it naming a dead pid.
	 */
	clearReclaimTimer: () => void;
	exit: (code: number) => void;
	/** Kernel-level self-kill for when Node's own exit path would hang. */
	hardExit: () => void;
	/** Returns a cancel function. Production wraps an unref'd `setTimeout`. */
	scheduleTimer?: (callback: () => void, delayMs: number) => () => void;
	log?: (message: string) => void;
	graceMs?: number;
	disposeTimeoutMs?: number;
}

export function createShutdown(deps: ShutdownDeps): (reason: string) => void {
	const {
		getServer,
		getDispose,
		clearReclaimTimer,
		exit,
		hardExit,
		scheduleTimer = (callback, delayMs) => {
			const timer = setTimeout(callback, delayMs);
			timer.unref();
			return () => clearTimeout(timer);
		},
		log = (message) => console.log(message),
		graceMs = SHUTDOWN_GRACE_MS,
		disposeTimeoutMs = DISPOSE_TIMEOUT_MS,
	} = deps;

	let shuttingDown = false;

	const disposeThenExit = () => {
		const dispose = getDispose();
		if (!dispose) {
			exit(0);
			return;
		}
		let settled = false;
		const cancelDeadline = scheduleTimer(() => {
			if (settled) return;
			settled = true;
			log(
				`[host-service] dispose did not finish within ${disposeTimeoutMs}ms (worker wedged?); hard-exiting`,
			);
			hardExit();
		}, disposeTimeoutMs);
		dispose().then(
			() => {
				if (settled) return;
				settled = true;
				cancelDeadline();
				log("[host-service] shutdown complete");
				exit(0);
			},
			(error: unknown) => {
				if (settled) return;
				settled = true;
				cancelDeadline();
				log(`[host-service] dispose failed: ${String(error)}`);
				exit(0);
			},
		);
	};

	return (reason: string) => {
		if (shuttingDown) {
			// A repeat signal means whoever is waiting on us has run out of
			// patience (the coordinator's SIGKILL escalation, or a human with
			// `kill`). Ignoring it is how the orphan stayed alive for hours.
			log(
				`[host-service] shutdown (${reason}) while already shutting down; hard-exiting`,
			);
			hardExit();
			return;
		}
		shuttingDown = true;
		clearReclaimTimer();
		log(`[host-service] shutdown (${reason}), draining connections`);
		const server = getServer();
		if (!server) {
			// Nothing listening yet, so there is nothing to drain. Workers may
			// already exist though (createApp() runs before serve()), so exit
			// through the same bounded dispose rather than a bare process.exit().
			disposeThenExit();
			return;
		}
		server.close();
		scheduleTimer(() => {
			server.closeAllConnections?.();
			disposeThenExit();
		}, graceMs);
	};
}
