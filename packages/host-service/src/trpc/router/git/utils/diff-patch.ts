import { spawn } from "node:child_process";
import {
	type DiffCategory,
	type DiffCategoryRefs,
	mapWithConcurrency,
} from "./git-helpers.ts";

/** Context lines each hunk carries. The renderer expands beyond this by
 * hydrating the file's full contents on demand, so shipping more here only
 * makes the patch bigger for changesets nobody expands. */
const PATCH_CONTEXT_LINES = 3;

/** How many `git diff --no-index` calls for untracked files run at once. */
const UNTRACKED_CONCURRENCY = 8;

/**
 * Most patch text one request may build, across the category's diff and every
 * untracked file's section.
 *
 * A working tree can hold a file of any size — an unignored log, a database
 * dump, a vendored tree — and an untracked file's diff is the whole file, so
 * without a bound the patch is as big as the repository. V8 refuses strings
 * past ~512 MB, and building the patch threw `RangeError: Invalid string
 * length` out of the git worker (HOST-SERVICE-5C), which fails every file in
 * the Changes pane rather than the one nobody could read anyway.
 *
 * 32 MB is far past any patch a person reads (it is also what #7279 bounds a
 * transcript line to) and leaves the JSON-encoded response an order of
 * magnitude clear of the limit.
 */
export const MAX_PATCH_BYTES = 32 * 1024 * 1024;

/** Enough of git's stderr to explain a failure. Bounded for the same reason
 * as the patch: `warning:` lines are per-file, so a big enough repository
 * makes even the error message unbounded. */
const MAX_STDERR_BYTES = 64 * 1024;

const BASE_ARGS = [
	"--no-color",
	"--no-ext-diff",
	"--find-renames",
	`--unified=${PATCH_CONTEXT_LINES}`,
];

/** Builds the `git diff` argv for a category. Mirrors the ref pairs
 * `loadFileDiffContent` compares file-by-file, so a patch and a hydrated file
 * always describe the same two sides. */
function diffArgsForCategory(
	category: DiffCategory,
	refs: DiffCategoryRefs,
): string[] {
	if (category === "against-base") {
		return ["diff", ...BASE_ARGS, refs.originRef ?? "HEAD", "HEAD"];
	}
	if (category === "commit") {
		return [
			"diff",
			...BASE_ARGS,
			refs.fromRef ?? "HEAD^",
			refs.toRef ?? "HEAD",
		];
	}
	if (category === "staged") {
		return ["diff", ...BASE_ARGS, "--cached"];
	}
	// Unstaged: index against working tree.
	return ["diff", ...BASE_ARGS];
}

/** One request's shared byte allowance. The category diff and every
 * `--no-index` run draw from the same budget because it is their
 * concatenation that has to stay inside the limit. */
class PatchBudget {
	private remaining: number;

	constructor(limit: number) {
		this.remaining = limit;
	}

	get exhausted(): boolean {
		return this.remaining <= 0;
	}

	/** Grants up to `bytes`, returning how many. A short grant means the
	 * caller has just read the last output it may keep. */
	take(bytes: number): number {
		const granted = Math.min(bytes, this.remaining);
		this.remaining -= granted;
		return granted;
	}
}

interface DiffSection {
	patch: string;
	/** The budget ran out first, so this diff is missing its tail. */
	truncated: boolean;
}

/** Cuts a diff that was stopped mid-stream back to its last complete file
 * section. The renderer parses the patch into `diff --git` sections and shows
 * a placeholder for any file it finds none for; half a section would instead
 * render as a diff silently missing its hunks. Every content line is prefixed
 * (` `, `+`, `-`), so `diff --git ` at the start of a line is always a real
 * header, and the section it opens is the one that was cut. */
function dropIncompleteFileSection(patch: string): string {
	const lastHeader = patch.lastIndexOf("\ndiff --git ");
	// No earlier header: the single section this output started is the
	// incomplete one, and nothing of it can be shown.
	if (lastHeader === -1) return "";
	return patch.slice(0, lastHeader + 1);
}

interface GitSpawnOptions {
	/** Worktree the diff is taken in. */
	cwd: string;
	/** Credentials and locale for the git process. Replaces the environment
	 * outright, which is what simple-git's `.env()` does with the same
	 * object — `createGitEnvResolver` builds a complete environment. */
	env: Record<string, string>;
}

/**
 * Runs one `git diff` and keeps only what the budget still allows, killing
 * git once it is spent. The patch is bounded as it is read rather than
 * checked afterwards: the string that would be too long is never built, so no
 * repository state can throw here.
 */
function runDiff(
	args: string[],
	options: GitSpawnOptions,
	budget: PatchBudget,
): Promise<DiffSection> {
	if (budget.exhausted) return Promise.resolve({ patch: "", truncated: true });

	return new Promise<DiffSection>((resolve, reject) => {
		const child = spawn("git", args, { ...options, windowsHide: true });
		const chunks: Buffer[] = [];
		let stderr = "";
		let truncated = false;

		child.stdout.on("data", (chunk: Buffer) => {
			if (truncated) return;
			const granted = budget.take(chunk.byteLength);
			if (granted > 0) chunks.push(chunk.subarray(0, granted));
			if (granted === chunk.byteLength) return;
			truncated = true;
			// Nothing more will be kept, and diffing the rest of a huge tree
			// costs minutes of CPU whose output is thrown away.
			child.kill("SIGKILL");
		});
		child.stderr.on("data", (chunk: Buffer) => {
			if (stderr.length < MAX_STDERR_BYTES) stderr += chunk.toString("utf8");
		});
		// A spawn that never produced a process rejects with Node's own error,
		// whose message ("spawn git ENOENT") is what spawn-failure-diagnostics
		// matches on.
		child.once("error", reject);
		child.once("close", (code) => {
			const patch = Buffer.concat(chunks).toString("utf8");
			if (truncated) {
				resolve({ patch: dropIncompleteFileSection(patch), truncated });
				return;
			}
			// simple-git's own rule, kept so the same failures reject as
			// before: a non-zero exit with nothing on stderr is `--no-index`
			// reporting "differences found", not a failure. The message is
			// git's stderr alone — simple-git prefixed stdout, which for this
			// command is the very patch that has to stay bounded.
			if (code !== 0 && stderr.length > 0) {
				reject(new Error(stderr));
				return;
			}
			resolve({ patch, truncated: false });
		});
	});
}

/** `git diff` never reports untracked files, but the Changes pane lists them,
 * so each one gets its own `--no-index` patch against /dev/null. A file that
 * fails on its own (deleted since the status snapshot, unreadable) yields no
 * section, exactly as before — the rest of the patch still renders. */
async function untrackedPatches(
	paths: string[],
	options: GitSpawnOptions,
	budget: PatchBudget,
): Promise<DiffSection[]> {
	return mapWithConcurrency(paths, UNTRACKED_CONCURRENCY, async (path) => {
		try {
			return await runDiff(
				["diff", ...BASE_ARGS, "--no-index", "--", "/dev/null", path],
				options,
				budget,
			);
		} catch {
			return { patch: "", truncated: false };
		}
	});
}

export interface DiffPatchRequest extends GitSpawnOptions {
	category: DiffCategory;
	refs: DiffCategoryRefs;
	/** Restricts the patch to these paths; empty means the whole category. */
	paths?: string[];
	/** Paths git won't diff on its own — see `untrackedPatches`. */
	untrackedPaths?: string[];
	/** Overridable so a test can reach the bound without a huge repository. */
	maxBytes?: number;
}

/** One patch covering a whole category, plus a section per untracked file,
 * bounded by `maxBytes`. The renderer parses this into per-file metadata
 * (`parsePatchFiles`) and fetches full contents later, only for files
 * somebody expands or edits. Files past the bound get no section and render
 * as placeholders, the same as any other file the patch has no section for. */
export async function buildDiffPatch({
	cwd,
	env,
	category,
	refs,
	paths,
	untrackedPaths,
	maxBytes = MAX_PATCH_BYTES,
}: DiffPatchRequest): Promise<string> {
	const budget = new PatchBudget(maxBytes);
	const options = { cwd, env };
	const args = diffArgsForCategory(category, refs);
	if (paths?.length) args.push("--", ...paths);

	// No `.catch` here on purpose: swallowing a failure would return an empty
	// patch, which the renderer can't tell apart from "nothing changed" — it
	// would render every file as a placeholder with no way to retry.
	const tracked = await runDiff(args, options, budget);
	const untracked = untrackedPaths?.length
		? await untrackedPatches(untrackedPaths, options, budget)
		: [];

	const sections = [tracked, ...untracked];
	if (sections.some((section) => section.truncated)) {
		console.warn(
			`[git/getDiffPatch] ${cwd}: patch reached the ${maxBytes} byte bound; files past the cut render as placeholders`,
		);
	}
	return sections
		.map((section) => section.patch)
		.filter(Boolean)
		.join("");
}
