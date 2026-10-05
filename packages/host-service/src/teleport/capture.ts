import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
	createGitRunner,
	type GitRunner,
	TELEPORT_IDENTITY,
} from "./git-runner";
import {
	DEFAULT_PRECIOUS_PATHSPECS,
	findPreciousFiles,
} from "./precious-files";

/**
 * Capture a checkout's uncommitted work as commits, so it can travel the way
 * commits already do.
 *
 * Two commits are built on top of HEAD: one holding the index exactly as it
 * stands, and a child holding the whole working tree — modified, untracked,
 * and the ignored-but-precious files. Both are written through a *copy* of
 * the index, so the checkout's real index, branch, and files are never
 * touched and the user can keep typing while a teleport runs.
 *
 * The pair is what lets the destination restore staged and unstaged work
 * separately, rather than arriving with everything merged into one blob.
 */

const STAGED_MESSAGE = "superset teleport: staged changes";
const WORKING_MESSAGE = "superset teleport: working tree";

export interface HandoffCapture {
	/** The ref now pointing at `working`. */
	ref: string;
	/** The commit the checkout was on; the restore's base. */
	head: string;
	/** Commit of the index tree, parented on `head`. */
	staged: string;
	/** Commit of the full working tree, parented on `staged`. */
	working: string;
	/** The working tree's own id: equal across captures of identical content. */
	workingTree: string;
	/** Ignored files carried along, repo-relative. */
	preciousFiles: string[];
}

export interface CaptureHandoffInput {
	worktreePath: string;
	ref: string;
	/** Overrides the default `.env`-class allowlist. */
	preciousPathspecs?: readonly string[];
	git?: GitRunner;
}

export async function captureHandoff({
	worktreePath,
	ref,
	preciousPathspecs = DEFAULT_PRECIOUS_PATHSPECS,
	git = createGitRunner(worktreePath),
}: CaptureHandoffInput): Promise<HandoffCapture> {
	const head = await git.run(["rev-parse", "HEAD"]);
	const stagedTree = await git.run(["write-tree"]);

	const scratch = await mkdtemp(join(tmpdir(), "superset-teleport-"));
	try {
		const indexFile = join(scratch, "index");
		await copyFile(await resolveIndexPath(git, worktreePath), indexFile);
		const scoped = { GIT_INDEX_FILE: indexFile };

		// `add -A` honours .gitignore, so this is every tracked change plus
		// every untracked file the user would see in `git status`.
		await git.runWithEnv(["add", "-A"], scoped);

		const preciousFiles = await findPreciousFiles(
			git,
			worktreePath,
			preciousPathspecs,
		);
		if (preciousFiles.length > 0) {
			// `-f` is the point: these are ignored, and ignored is exactly why
			// nothing else would carry them.
			await git.runWithEnv(["add", "-f", "--", ...preciousFiles], scoped);
		}

		const workingTree = await git.runWithEnv(["write-tree"], scoped);
		const staged = await commitTree(git, stagedTree, head, STAGED_MESSAGE);
		const working = await commitTree(git, workingTree, staged, WORKING_MESSAGE);
		await git.run(["update-ref", ref, working]);

		return { ref, head, staged, working, workingTree, preciousFiles };
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

/** Drop a capture's ref once it has been transferred, or after a failure. */
export async function discardCapture(
	worktreePath: string,
	ref: string,
	git: GitRunner = createGitRunner(worktreePath),
): Promise<void> {
	await git.run(["update-ref", "-d", ref]).catch(() => {
		// Already gone, or never created. Nothing downstream depends on the
		// ref's absence, and the objects are collected by gc either way.
	});
}

async function commitTree(
	git: GitRunner,
	tree: string,
	parent: string,
	message: string,
): Promise<string> {
	return git.runWithEnv(
		["commit-tree", "--no-gpg-sign", tree, "-p", parent, "-m", message],
		TELEPORT_IDENTITY,
	);
}

/**
 * `rev-parse --git-path index` answers relative to the working directory for
 * a normal checkout and absolutely for a linked worktree, so the result has
 * to be resolved rather than joined.
 */
async function resolveIndexPath(
	git: GitRunner,
	worktreePath: string,
): Promise<string> {
	const reported = await git.run(["rev-parse", "--git-path", "index"]);
	return isAbsolute(reported) ? reported : resolve(worktreePath, reported);
}
