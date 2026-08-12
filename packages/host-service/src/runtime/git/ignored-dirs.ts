import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Bounds for a pathological repo (thousands of ignored entries): the caller
// turns each dir into a per-event glob/prefix check, so an unbounded list
// would trade watcher churn for matcher churn.
const MAX_IGNORED_DIRS = 200;
const TIMEOUT_MS = 3_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Worktree-relative directories that git ignores entirely, straight from
 * `git ls-files --others --ignored --exclude-standard --directory`. Asking
 * git (instead of parsing .gitignore) keeps the answer authoritative across
 * nested .gitignore files, `.git/info/exclude`, and the global excludesfile.
 *
 * Only collapsed `dir/` entries are returned: `--directory` collapses a
 * directory to one entry only when nothing inside it is tracked, so pruning
 * these subtrees can never hide a tracked file's changes. Individual ignored
 * files (e.g. `.env`) are deliberately excluded — files stay watched so an
 * open gitignored file still live-reloads.
 *
 * Returns [] for non-git roots, timeouts, and every other failure — callers
 * degrade to the static ignore list, never block on this.
 */
export async function listGitIgnoredDirs(rootPath: string): Promise<string[]> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			[
				"-C",
				rootPath,
				"ls-files",
				"--others",
				"--ignored",
				"--exclude-standard",
				"--directory",
				"-z",
			],
			{ timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES },
		);
		const dirs: string[] = [];
		for (const entry of stdout.split("\0")) {
			if (!entry.endsWith("/")) continue;
			dirs.push(entry.slice(0, -1));
			if (dirs.length >= MAX_IGNORED_DIRS) break;
		}
		return dirs;
	} catch {
		return [];
	}
}
