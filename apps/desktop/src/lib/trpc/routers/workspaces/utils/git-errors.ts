/**
 * A git operation failed because of the user's environment — a worktree
 * deleted outside the app, a pathological working tree (e.g. a home directory
 * registered as a repo), a cold network volume — not because of a bug.
 * Callers treat these as degraded states; the Sentry tRPC middleware skips
 * them by name, which survives the git worker's error serialization where
 * `instanceof` does not.
 */
export class GitEnvironmentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GitEnvironmentError";
	}
}
