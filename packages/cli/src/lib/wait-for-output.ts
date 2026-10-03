export interface WaitForOutputMatchDeps {
	/** `signal` aborts once the deadline passes while a read is in flight, or the caller gives up. */
	readText: (signal: AbortSignal) => Promise<string>;
	/** Resolves early when `signal` aborts. */
	sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
	now?: () => number;
}

export interface WaitForOutputMatchOptions {
	regex: RegExp;
	timeoutMs: number;
	pollIntervalMs: number;
	/** The caller giving up (Ctrl-C): the pending read and sleep end at once. */
	signal?: AbortSignal;
}

export interface OutputMatchResult {
	text: string;
	match: string;
}

export class WaitForOutputTimeoutError extends Error {
	constructor(regex: RegExp, timeoutMs: number) {
		super(`Timed out after ${timeoutMs}ms waiting for ${regex} to match`);
		this.name = "WaitForOutputTimeoutError";
	}
}

/**
 * Poll `readText` until it matches `regex` or `timeoutMs` elapses. The first
 * read happens before any sleep, so text already on the screen matches at
 * once. The deadline also cuts a read that never settles.
 */
export async function waitForOutputMatch(
	deps: WaitForOutputMatchDeps,
	options: WaitForOutputMatchOptions,
): Promise<OutputMatchResult> {
	const now = deps.now ?? Date.now;
	const deadline = now() + options.timeoutMs;
	const timeout = () =>
		new WaitForOutputTimeoutError(options.regex, options.timeoutMs);
	const { signal } = options;

	while (true) {
		throwIfAborted(signal);
		const budget = deadline - now();
		if (budget <= 0) throw timeout();

		const text = await readWithin(deps.readText, budget, timeout, signal);
		const match = text.match(options.regex);
		if (match) return { text, match: match[0] };

		const remaining = deadline - now();
		if (remaining <= 0) throw timeout();
		await deps.sleep(Math.min(options.pollIntervalMs, remaining), signal);
	}
}

export function abortableSleep(
	ms: number,
	signal?: AbortSignal,
): Promise<void> {
	return new Promise((resolve) => {
		if (signal?.aborted) return resolve();
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			resolve();
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
}

function readWithin(
	readText: WaitForOutputMatchDeps["readText"],
	budgetMs: number,
	timeout: () => Error,
	outer: AbortSignal | undefined,
): Promise<string> {
	const controller = new AbortController();
	const expired = new Promise<never>((_, reject) => {
		controller.signal.addEventListener(
			"abort",
			() =>
				reject(
					outer?.aborted ? (outer.reason ?? new Error("Aborted")) : timeout(),
				),
			{ once: true },
		);
	});
	const onOuterAbort = () => controller.abort();
	outer?.addEventListener("abort", onOuterAbort, { once: true });
	const timer = setTimeout(() => controller.abort(), budgetMs);
	// A synchronous throw from readText must still settle the race, or the
	// timer would later reject `expired` with nobody listening.
	return Promise.race([
		Promise.resolve().then(() => readText(controller.signal)),
		expired,
	]).finally(() => {
		clearTimeout(timer);
		outer?.removeEventListener("abort", onOuterAbort);
	});
}
