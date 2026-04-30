import type { SimpleGit } from "simple-git";

/**
 * Run a `git config` write with bounded retries on `.git/config.lock`
 * contention.
 *
 * `git config` takes a per-config flock that's held for milliseconds.
 * Two concurrent writes (e.g. a renderer double-click on the base-branch
 * picker, or `setBaseBranch` racing with `workspaceCreation.create`'s
 * own config write) cause one to fail with:
 *
 *   error: could not lock config file .git/config: File exists
 *
 * We catch that specific shape and retry with a short backoff so the
 * second writer just waits its turn instead of bubbling a confusing 500
 * to the renderer.
 */
export async function gitConfigWrite(
	git: SimpleGit,
	args: string[],
	options: { retries?: number; baseDelayMs?: number } = {},
): Promise<string> {
	// `retries` is the number of *additional* attempts after the first try,
	// so default 4 == 1 initial + 4 retries (5 total), with backoff
	// 30/60/120/240ms between them. Clamped at 0 to keep the loop sane.
	const retries = Math.max(0, options.retries ?? 4);
	const baseDelayMs = options.baseDelayMs ?? 30;
	let lastErr: unknown = new Error("gitConfigWrite: no attempt completed");
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await git.raw(args);
		} catch (err) {
			lastErr = err;
			const message = err instanceof Error ? err.message : String(err);
			if (!message.includes("could not lock config file")) throw err;
			if (attempt === retries) break;
			await new Promise((resolve) =>
				setTimeout(resolve, baseDelayMs * 2 ** attempt),
			);
		}
	}
	throw lastErr;
}
