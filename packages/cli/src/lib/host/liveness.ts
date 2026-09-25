import { checkHostHealth, type HostHealth } from "./health";

const CHECK_INTERVAL_MS = 10_000;
const UNRESPONSIVE_AFTER_FAILURES = 6;

export interface HostLivenessOptions {
	endpoint: string;
	authToken: string;
	signal: AbortSignal;
	intervalMs?: number;
	failureThreshold?: number;
	check?: (endpoint: string, authToken: string) => Promise<HostHealth>;
}

/**
 * Resolves `true` once the host has failed `failureThreshold` health checks in
 * a row, `false` if `signal` aborts first. A host whose event loop is wedged
 * stays alive as a process, so waiting on its exit alone never notices.
 */
export async function waitForUnresponsiveHost({
	endpoint,
	authToken,
	signal,
	intervalMs = CHECK_INTERVAL_MS,
	failureThreshold = UNRESPONSIVE_AFTER_FAILURES,
	check = checkHostHealth,
}: HostLivenessOptions): Promise<boolean> {
	let consecutiveFailures = 0;
	while (!signal.aborted) {
		await new Promise<void>((resolve) => {
			const timer = setTimeout(done, intervalMs);
			function done() {
				clearTimeout(timer);
				signal.removeEventListener("abort", done);
				resolve();
			}
			signal.addEventListener("abort", done, { once: true });
		});
		if (signal.aborted) return false;

		const { healthy } = await check(endpoint, authToken);
		consecutiveFailures = healthy ? 0 : consecutiveFailures + 1;
		if (consecutiveFailures >= failureThreshold) return true;
	}
	return false;
}
