// Every growth source is a third party on the request path of an admin page
// procedure that Vercel cuts off at 60 seconds. A stalled upstream should fail
// its own tile quickly rather than hold the whole batch to that limit.
const DEFAULT_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
	url: string,
	init: RequestInit = {},
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
	return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
