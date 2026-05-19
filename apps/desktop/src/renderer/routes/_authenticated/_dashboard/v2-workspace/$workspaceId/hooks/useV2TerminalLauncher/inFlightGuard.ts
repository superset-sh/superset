/**
 * Drops re-entrant calls while a prior invocation is still in flight. Used
 * to coalesce rapid Cmd+T / "New Terminal" presses during the cold-start
 * daemon bootstrap so they don't all spawn a terminal once the bootstrap
 * unblocks.
 */
export function createInFlightGuard(): {
	run: (fn: () => Promise<void>) => Promise<void>;
} {
	let inFlight = false;
	return {
		async run(fn) {
			if (inFlight) return;
			inFlight = true;
			try {
				await fn();
			} finally {
				inFlight = false;
			}
		},
	};
}
