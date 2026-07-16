/**
 * Poll a synchronous predicate every 50ms until it holds or the deadline
 * passes, then evaluate it one final time so a truth that lands exactly at
 * the deadline still counts.
 */
export async function waitFor(
	predicate: () => boolean,
	timeoutMs = 5_000,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return true;
		await new Promise((r) => setTimeout(r, 50));
	}
	return predicate();
}
