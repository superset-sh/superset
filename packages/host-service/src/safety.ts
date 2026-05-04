/**
 * Host-service crash isolation.
 *
 * Policy: the main host-service process must stay up even when a subsystem
 * throws. We rely on a process-level safety net as the primary mechanism —
 * Node already routes throws from `setInterval`, `setTimeout`, `EventEmitter`
 * listeners, native callbacks (`pty.onData`/`onExit`), and orphaned promise
 * continuations into `uncaughtException` / `unhandledRejection`, so a single
 * handler covers all of them.
 *
 * The two places where this isn't enough are fan-out loops over multiple
 * subscribers (broadcasts, listener iteration). A throw there skips the
 * remaining iterations, so those sites use inline `try/catch` directly.
 */

let safetyNetInstalled = false;

export function installProcessSafetyNet(): void {
	if (safetyNetInstalled) return;
	safetyNetInstalled = true;

	process.on("uncaughtException", (error, origin) => {
		console.error("[host-service] uncaughtException — staying up", {
			origin,
			error,
		});
	});

	process.on("unhandledRejection", (reason) => {
		console.error("[host-service] unhandledRejection — staying up", { reason });
	});
}
