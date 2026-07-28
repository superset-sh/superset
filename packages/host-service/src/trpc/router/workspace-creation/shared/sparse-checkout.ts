import { TRPCError } from "@trpc/server";
import type { GitClient } from "./types";

/**
 * Cone-mode sparse checkout for new worktrees.
 *
 * A project can list the folders its worktrees actually need; everything else
 * stays out of the working tree. Cone mode always keeps the files at the repo
 * root, so root-level manifests and configs are present regardless.
 *
 * The stored column is a JSON array, but that encoding never leaves this
 * module — callers pass and receive `string[]`.
 */

/** Keeps a runaway paste from bloating the row and the `git` argv. */
const MAX_SPARSE_CHECKOUT_PATHS = 200;

/**
 * Normalize one user-supplied folder into a cone-mode entry: repo-relative,
 * forward slashes, no leading `./` or trailing separator. Returns null for
 * entries that are empty once trimmed.
 */
export function normalizeSparseCheckoutPath(input: string): string | null {
	const trimmed = input.trim().replace(/\\/g, "/");
	if (!trimmed) return null;

	// Leading "./" and "/" are how people naturally write a repo-relative
	// folder; git wants neither.
	const stripped = trimmed.replace(/^(?:\.?\/)+/, "").replace(/\/+$/, "");
	if (!stripped || stripped === ".") return null;

	if (stripped.split("/").includes("..")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Sparse checkout folder cannot escape the repo root: ${input.trim()}`,
		});
	}

	return stripped;
}

/** Normalize, drop blanks, and de-duplicate while preserving input order. */
export function normalizeSparseCheckoutPaths(inputs: string[]): string[] {
	const seen = new Set<string>();
	for (const input of inputs) {
		const path = normalizeSparseCheckoutPath(input);
		if (path) seen.add(path);
	}
	const paths = [...seen];
	if (paths.length > MAX_SPARSE_CHECKOUT_PATHS) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Too many sparse checkout folders (max ${MAX_SPARSE_CHECKOUT_PATHS})`,
		});
	}
	return paths;
}

/** Read the stored column. Anything unreadable degrades to a full checkout. */
export function parseSparseCheckoutPaths(
	raw: string | null | undefined,
): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}

/** Encode for storage. Null means "full checkout", matching the other knobs. */
export function serializeSparseCheckoutPaths(paths: string[]): string | null {
	return paths.length > 0 ? JSON.stringify(paths) : null;
}

/**
 * `git worktree add`, honoring the project's sparse-checkout folders.
 *
 * With folders configured this follows the recipe from git-worktree(1):
 * add with `--no-checkout`, set the cone, then check out — so the excluded
 * folders are never written to disk in the first place.
 *
 * `worktreeArgs` are the arguments that follow `worktree add`, so the caller
 * keeps full control over `-b`, `--track`, and the start point.
 */
export async function addWorktreeWithSparseCheckout(args: {
	git: GitClient;
	worktreeArgs: string[];
	worktreePath: string;
	sparsePaths: string[];
	logPrefix: string;
}): Promise<void> {
	const { git, worktreeArgs, worktreePath, sparsePaths, logPrefix } = args;

	if (sparsePaths.length === 0) {
		await git.raw(["worktree", "add", ...worktreeArgs]);
		return;
	}

	await git.raw(["worktree", "add", "--no-checkout", ...worktreeArgs]);

	// Past this point the worktree exists on disk, so anything that throws has
	// to take it back down — callers treat a throw from here as "nothing was
	// created" and run their own rollback only for later failures.
	try {
		// A sparse checkout is an optimization, never a correctness requirement:
		// if git rejects the patterns, fall back to a full checkout rather than
		// hand back a worktree holding nothing but the root files.
		try {
			// `--` keeps a folder starting with a dash from being read as a flag.
			await git.raw([
				"-C",
				worktreePath,
				"sparse-checkout",
				"set",
				"--cone",
				"--",
				...sparsePaths,
			]);
		} catch (err) {
			console.warn(
				`${logPrefix} sparse checkout failed, falling back to a full checkout:`,
				err,
			);
			await git
				.raw(["-C", worktreePath, "sparse-checkout", "disable"])
				.catch(() => {});
		}

		await git.raw(["-C", worktreePath, "checkout"]);
	} catch (err) {
		await git
			.raw(["worktree", "remove", "--force", worktreePath])
			.catch((removeErr) => {
				console.warn(
					`${logPrefix} failed to remove the worktree after a failed checkout:`,
					removeErr,
				);
			});
		throw err;
	}
}
