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

type NormalizeResult =
	| { kind: "ok"; path: string }
	| { kind: "empty" }
	| { kind: "invalid"; reason: string };

/**
 * Shared normalization core: repo-relative, forward slashes, no leading `./`
 * or trailing separator. Distinguishes "nothing here" from "can't use this" so
 * the write path can report a reason and the read path can just drop the entry.
 */
function normalizeEntry(input: string): NormalizeResult {
	const trimmed = input.trim().replace(/\\/g, "/");
	if (!trimmed) return { kind: "empty" };

	// Leading "./" and "/" are how people naturally write a repo-relative
	// folder; git wants neither.
	const stripped = trimmed.replace(/^(?:\.?\/)+/, "").replace(/\/+$/, "");
	if (!stripped || stripped === ".") return { kind: "empty" };

	const segments = stripped.split("/");
	if (segments.includes("..")) {
		return {
			kind: "invalid",
			reason: `Sparse checkout folder cannot escape the repo root: ${input.trim()}`,
		};
	}
	// `git sparse-checkout set` reads a leading dash as an option. Rejecting it
	// here keeps the command free of a `--` separator, whose handling differs
	// across the git versions this app supports.
	if (segments.some((segment) => segment.startsWith("-"))) {
		return {
			kind: "invalid",
			reason: `Sparse checkout folder cannot start with "-": ${input.trim()}`,
		};
	}

	return { kind: "ok", path: stripped };
}

/**
 * Normalize one user-supplied folder into a cone-mode entry. Returns null for
 * entries that are empty once trimmed, and throws on ones git can't be handed.
 */
export function normalizeSparseCheckoutPath(input: string): string | null {
	const result = normalizeEntry(input);
	if (result.kind === "invalid") {
		throw new TRPCError({ code: "BAD_REQUEST", message: result.reason });
	}
	return result.kind === "ok" ? result.path : null;
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

/**
 * Read the stored column. Re-normalizes rather than trusting what was written,
 * so the "safe to hand to git" guarantee lives with the consumer instead of
 * depending on every writer — including a hand-edited row. Anything unreadable
 * or unusable is dropped, degrading toward a full checkout rather than throwing
 * and failing workspace creation.
 */
export function parseSparseCheckoutPaths(
	raw: string | null | undefined,
): string[] {
	if (!raw) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];

	const paths: string[] = [];
	for (const item of parsed) {
		if (typeof item !== "string") continue;
		const result = normalizeEntry(item);
		if (result.kind === "ok" && !paths.includes(result.path)) {
			paths.push(result.path);
		}
	}
	return paths;
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
			// No `--` separator: git changed how it handles one here in 2.44, and
			// normalization already rejects the leading-dash folders it guarded.
			await git.raw([
				"-C",
				worktreePath,
				"sparse-checkout",
				"set",
				"--cone",
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
