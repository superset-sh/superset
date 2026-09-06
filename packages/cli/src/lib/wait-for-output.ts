/**
 * Poll `readText` until its result matches `regex`, or `timeoutMs` elapses.
 * Checks immediately before the first sleep, so text already present at call
 * time matches right away — mirroring `terminals wait`'s "resolves at once
 * when it already matches" behavior, and Herdr's own `pane wait-output`,
 * which explicitly does not require the match to be *new* output.
 *
 * Deps are injected (real clock/sleep/reader vs. fakes) so this is testable
 * without real timers or a live terminal.
 */
export interface WaitForOutputMatchDeps {
	readText: () => Promise<string>;
	sleep: (ms: number) => Promise<void>;
	now?: () => number;
}

export interface WaitForOutputMatchOptions {
	regex: RegExp;
	timeoutMs: number;
	pollIntervalMs: number;
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

export async function waitForOutputMatch(
	deps: WaitForOutputMatchDeps,
	options: WaitForOutputMatchOptions,
): Promise<OutputMatchResult> {
	const now = deps.now ?? Date.now;
	const deadline = now() + options.timeoutMs;

	while (true) {
		const text = await deps.readText();
		const match = text.match(options.regex);
		if (match) return { text, match: match[0] };

		const remaining = deadline - now();
		if (remaining <= 0) {
			throw new WaitForOutputTimeoutError(options.regex, options.timeoutMs);
		}
		await deps.sleep(Math.min(options.pollIntervalMs, remaining));
	}
}
