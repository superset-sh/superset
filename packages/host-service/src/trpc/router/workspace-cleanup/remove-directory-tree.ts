import type { Dirent, Stats } from "node:fs";
import { chmod, lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** Owner read + write + execute — what deleting a directory's contents needs:
 * read to list it, write to unlink its entries, execute to descend into it. */
const OWNER_ACCESS = 0o700;

/**
 * `rm -rf` with one recovery pass for the single removal failure a delete can
 * undo by itself: a directory inside the tree whose owner write bit was
 * cleared. Unlinking an entry is a write to the directory *holding* it, so one
 * such directory makes its whole subtree undeletable — by us, by
 * `git worktree remove`, and by the user's own `rm -rf` — and every retry
 * fails identically until the bit comes back (HOST-SERVICE-5J).
 *
 * The producers are ordinary tooling, not corruption: `go mod download`
 * leaves every module directory in its cache at 0555 by design, and
 * eval/report runners often do the same to an output folder. Both were
 * observed inside worktrees.
 *
 * Only EACCES takes the recovery path. Every other failure — ENOTEMPTY from a
 * live writer re-creating files, EBUSY, or an EPERM from an immutable flag
 * that chmod could not clear anyway — is rethrown untouched so the caller
 * reports it exactly as before.
 */
export async function removeDirectoryTree(path: string): Promise<void> {
	try {
		await rm(path, { recursive: true, force: true });
		return;
	} catch (error) {
		if (!isPermissionDenied(error)) throw error;
	}
	await restoreOwnerDirectoryAccess(path);
	// One retry, not a loop: the pass above is exhaustive over the tree, so a
	// second denial is something chmod cannot fix and belongs in the report.
	await rm(path, { recursive: true, force: true });
}

/**
 * Read off the errno rather than the prototype: an fs error that has crossed
 * a worker boundary keeps `code` but loses its class. Deliberately EACCES
 * alone — EPERM is the immutable-flag/ownership denial, which a chmod by this
 * process cannot lift, and the rest are not permission failures at all.
 */
export function isPermissionDenied(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { code?: unknown }).code === "EACCES"
	);
}

/**
 * Give the owner full access to every directory in the tree, root first so
 * each one is readable before it is listed. Directories only: unlinking a file
 * needs write permission on the directory holding it, never on the file
 * itself. Symlinks are never followed — a link's dirent reports as a link, not
 * a directory — so the pass cannot reach outside the tree its caller already
 * gated. A failure at any node is left alone; the retry then gets as far as
 * the permissions allow and reports what still blocks it.
 */
async function restoreOwnerDirectoryAccess(root: string): Promise<void> {
	let stats: Stats;
	try {
		stats = await lstat(root);
	} catch {
		return;
	}
	if (!stats.isDirectory()) return;
	if ((stats.mode & OWNER_ACCESS) !== OWNER_ACCESS) {
		try {
			await chmod(root, stats.mode | OWNER_ACCESS);
		} catch {
			return;
		}
	}
	let entries: Dirent[];
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			await restoreOwnerDirectoryAccess(join(root, entry.name));
		}
	}
}
