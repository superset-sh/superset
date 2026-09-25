import { homedir, tmpdir } from "node:os";

/**
 * Moves the process off the directory it was launched from.
 *
 * host-service inherits its working directory from whoever started it — the
 * shell `superset start` ran in, the desktop app's own — and it outlives that
 * directory: deleting a workspace deletes a worktree, which is exactly where
 * someone starts a host from. Nothing here needs it. Every path the host
 * touches arrives absolute, from its config or from the request, and every
 * git process is given the worktree it runs in.
 *
 * What does need it is Node: a worker thread reads the process's working
 * directory while bootstrapping, before the task script even loads, so once
 * that directory is unlinked no worker can start at all — `ENOENT ... uv_cwd`,
 * three of them (HOST-SERVICE-5D) until HostWorkerPool's crash circuit opens
 * and every git task runs on the event loop for the rest of the process's
 * life. simple-git built without a base directory takes the same reading and
 * throws from its factory.
 *
 * Home first because a host runs as the user and its children inherit this;
 * the temp directory only if home is unusable (a service account pointed at
 * a HOME that does not exist).
 */
export function detachFromLaunchDirectory(): void {
	for (const target of [homedir(), tmpdir()]) {
		try {
			process.chdir(target);
			return;
		} catch {
			// Try the next one — an unusable candidate is not fatal, it just
			// leaves the process where the launcher put it.
		}
	}
	console.warn(
		"[host-service] could not leave the launch directory; deleting it will stop worker threads from starting",
	);
}
