import type { SimpleGit } from "simple-git";
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

/** `git diff` never reports untracked files, but the Changes pane lists them,
 * so each one gets its own `--no-index` patch against /dev/null. Exit code 1
 * just means "differences found", which simple-git surfaces as a rejection
 * carrying the patch on stdout. */
async function untrackedPatches(
	git: SimpleGit,
	paths: string[],
): Promise<string[]> {
	return mapWithConcurrency(paths, UNTRACKED_CONCURRENCY, async (path) => {
		try {
			return await git.raw([
				"diff",
				...BASE_ARGS,
				"--no-index",
				"--",
				"/dev/null",
				path,
			]);
		} catch (error) {
			const stdout = (error as { stdout?: string })?.stdout;
			return typeof stdout === "string" ? stdout : "";
		}
	});
}

export interface DiffPatchRequest {
	category: DiffCategory;
	refs: DiffCategoryRefs;
	/** Restricts the patch to these paths; empty means the whole category. */
	paths?: string[];
	/** Paths git won't diff on its own — see `untrackedPatches`. */
	untrackedPaths?: string[];
}

/** One patch covering a whole category, plus a section per untracked file.
 * The renderer parses this into per-file metadata (`parsePatchFiles`) and
 * fetches full contents later, only for files somebody expands or edits. */
export async function buildDiffPatch(
	git: SimpleGit,
	{ category, refs, paths, untrackedPaths }: DiffPatchRequest,
): Promise<string> {
	const args = diffArgsForCategory(category, refs);
	if (paths?.length) args.push("--", ...paths);

	// No `.catch` here on purpose: swallowing a failure would return an empty
	// patch, which the renderer can't tell apart from "nothing changed" — it
	// would render every file as a placeholder with no way to retry.
	const tracked = await git.raw(args);
	if (!untrackedPaths?.length) return tracked;

	const untracked = await untrackedPatches(git, untrackedPaths);
	return [tracked, ...untracked].filter(Boolean).join("");
}
