import { createGitRunner, type GitRunner } from "./git-runner";

/**
 * Put a capture back into a checkout.
 *
 * The two reads are ordered and both matter: `read-tree -m -u` moves the
 * *working tree* to the capture's full tree, then a plain `read-tree` sets
 * the index to the staged tree alone. Doing it the other way round, or with
 * a single read, loses the staged/unstaged split the user had — their
 * partially staged file arrives fully staged, or not staged at all.
 *
 * `-u` is what writes the files; binary content included, since git is
 * moving trees rather than applying a patch.
 */

export interface RestoreHandoffInput {
	worktreePath: string;
	/** The capture's ref, already fetched into this repository. */
	ref: string;
	git?: GitRunner;
}

export async function restoreHandoff({
	worktreePath,
	ref,
	git = createGitRunner(worktreePath),
}: RestoreHandoffInput): Promise<void> {
	await assertRestorable(git, ref);

	await git.run(["read-tree", "-m", "-u", "HEAD", ref]);
	await git.run(["read-tree", `${ref}^`]);
	await git.run(["update-ref", "-d", ref]).catch(() => {
		// The work is already in the tree; a surviving ref is litter, not a
		// failure, and gc will drop the objects once nothing points at them.
	});
	await git.run(["update-index", "-q", "--refresh"]).catch(() => {
		// Refreshing stat information is an optimisation. A failure here
		// leaves files looking modified until the next git command, which is
		// cosmetic.
	});
}

/**
 * A capture restores onto the commit it was taken from. If the destination
 * sits somewhere else, `read-tree -m -u` would either refuse or quietly
 * resolve a two-tree merge against the wrong base and take files with it —
 * so the mismatch is caught here, before anything touches the working tree.
 */
async function assertRestorable(git: GitRunner, ref: string): Promise<void> {
	const [head, base] = await Promise.all([
		git.run(["rev-parse", "HEAD"]),
		git.run(["rev-parse", `${ref}~2`]),
	]);
	if (head !== base) {
		throw new Error(
			`Teleport capture was taken at ${base.slice(0, 8)} but this checkout is at ${head.slice(0, 8)}`,
		);
	}
}
