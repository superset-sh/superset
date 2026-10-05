import { isProcessAlive } from "./manifest";

const TERMINATE_TIMEOUT_MS = 10_000;
const EXIT_POLL_INTERVAL_MS = 100;

function isMissingProcessError(error: unknown): boolean {
	return (error as NodeJS.ErrnoException)?.code === "ESRCH";
}

async function pollUntilDead(pid: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (isProcessAlive(pid)) {
		if (Date.now() >= deadline) return false;
		await new Promise((resolve) => setTimeout(resolve, EXIT_POLL_INTERVAL_MS));
	}
	return true;
}

async function settlesWithin(
	promise: Promise<unknown>,
	timeoutMs: number,
): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), timeoutMs);
	});
	const settled = await Promise.race([promise.then(() => true), timedOut]);
	clearTimeout(timer);
	return settled;
}

/**
 * SIGTERM the process, then SIGKILL it if it is still running after `timeoutMs`.
 * Pass `exited` when the process is our child; otherwise its pid is polled.
 */
export async function terminateProcess(
	pid: number,
	{
		exited,
		timeoutMs = TERMINATE_TIMEOUT_MS,
	}: { exited?: Promise<unknown>; timeoutMs?: number } = {},
): Promise<void> {
	if (!Number.isInteger(pid) || pid <= 0 || !isProcessAlive(pid)) return;
	try {
		process.kill(pid, "SIGTERM");
	} catch (error) {
		if (isMissingProcessError(error)) return;
		throw error;
	}
	const waitForExit = () =>
		exited ? settlesWithin(exited, timeoutMs) : pollUntilDead(pid, timeoutMs);
	if (await waitForExit()) return;
	try {
		process.kill(pid, "SIGKILL");
	} catch {}
	await waitForExit();
}
