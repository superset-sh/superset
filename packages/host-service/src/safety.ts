/**
 * Host-service crash isolation primitives.
 *
 * Policy: the main host-service process must stay up even when a subsystem
 * throws. We install process-level handlers as the last-resort backstop, and
 * expose `safeSync` / `safeAsync` to wrap timer/listener/watcher callbacks so
 * a single bad event in a subsystem doesn't propagate into Node's
 * uncaughtException path.
 *
 * Errors are always logged in a structured form so a "stays up but silently
 * broken" subsystem is still visible in logs.
 */

let safetyNetInstalled = false;

export function installProcessSafetyNet(label = "host-service"): void {
	if (safetyNetInstalled) return;
	safetyNetInstalled = true;

	process.on("uncaughtException", (error, origin) => {
		console.error(`[${label}] uncaughtException — staying up`, {
			origin,
			error,
		});
	});

	process.on("unhandledRejection", (reason) => {
		console.error(`[${label}] unhandledRejection — staying up`, { reason });
	});
}

/**
 * Wrap a synchronous callback so a throw is logged and absorbed rather than
 * propagating into the caller (e.g. `setTimeout`, `EventEmitter.emit`,
 * `pty.onData`). Returns the callback's value on success, `undefined` on
 * caught throw.
 */
export function safeSync<Args extends unknown[], R>(
	label: string,
	fn: (...args: Args) => R,
): (...args: Args) => R | undefined {
	return (...args: Args) => {
		try {
			return fn(...args);
		} catch (error) {
			console.error(`[${label}] callback threw — contained`, { error });
			return undefined;
		}
	};
}

/**
 * Wrap an async callback so a rejection is logged and absorbed. Use for
 * `setInterval(() => void asyncFn())`-style call sites and for `.then()`
 * continuations that have no upstream awaiter.
 */
export function safeAsync<Args extends unknown[], R>(
	label: string,
	fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R | undefined> {
	return async (...args: Args) => {
		try {
			return await fn(...args);
		} catch (error) {
			console.error(`[${label}] async callback rejected — contained`, {
				error,
			});
			return undefined;
		}
	};
}
