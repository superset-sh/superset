export interface TrailingRefreshScheduler {
	dispose: () => void;
	request: () => Promise<void>;
}

/**
 * Runs one refresh at a time and retains one trailing refresh when more events
 * arrive while the current refresh is active. This avoids cancel/restart churn
 * while guaranteeing that the last event is observed after the active request.
 */
export function createTrailingRefreshScheduler(
	refresh: () => Promise<unknown>,
): TrailingRefreshScheduler {
	let active = false;
	let disposed = false;
	let trailing = false;
	let drainPromise = Promise.resolve();

	return {
		dispose: () => {
			disposed = true;
			trailing = false;
		},
		request: () => {
			if (disposed) return Promise.resolve();
			if (active) {
				trailing = true;
				return drainPromise;
			}

			active = true;
			drainPromise = (async () => {
				try {
					do {
						trailing = false;
						try {
							await refresh();
						} catch {
							// React Query owns the error state. A queued trailing refresh
							// must still run so a transient failure cannot leave data stale.
						}
					} while (!disposed && trailing);
				} finally {
					active = false;
				}
			})();

			return drainPromise;
		},
	};
}
