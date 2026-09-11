import {
	type BranchPrefixMode,
	resolveBranchPrefix,
} from "@superset/shared/workspace-launch";
import { hostSettings } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import type { LocalProject } from "../shared/local-project";
import type { ExecGh } from "./exec-gh";

/** Resolves the authenticated GitHub username via `gh api user`. */
export async function getGitHubUsername(
	execGh: ExecGh,
): Promise<string | null> {
	try {
		const result = await execGh(["api", "user", "--jq", ".login"]);
		return typeof result === "string" && result.trim() ? result.trim() : null;
	} catch (error) {
		console.warn("[branch-prefix] failed to read GitHub username:", error);
		return null;
	}
}

/**
 * Resolves the branch prefix to apply to a *new* branch in this project.
 *
 * A project-level override (any non-null `branchPrefixMode`) wins over the
 * host-wide default in `host_settings`; absent both, no prefix is applied.
 * The resolved prefix is dropped when it would collide with an existing
 * branch name — git can't hold both `censys` and `censys/foo`.
 *
 * Returns the prefix segment (e.g. `censys`) or `undefined` for no prefix.
 */
export async function resolveProjectBranchPrefix({
	ctx,
	project,
	getAuthorName,
	existingBranches,
}: {
	ctx: HostServiceContext;
	project: LocalProject;
	/**
	 * Lazily resolves `git config user.name` for the "author" prefix mode,
	 * only invoked when a mode actually needs it. Callers that already hold
	 * an on-loop git client for other work (e.g. workspace creation) can
	 * wrap it directly; a caller with no other git need should resolve it
	 * off-loop instead (see workers/tasks/git.ts's `gitIdentityTask`) —
	 * this factory must never gain a `ctx.git()` call site of its own (see
	 * the no-main-loop-blocking ratchet).
	 */
	getAuthorName: () => Promise<string | null>;
	existingBranches: string[];
}): Promise<string | undefined> {
	const global = ctx.db.select().from(hostSettings).get();
	// Project override wins; otherwise fall back to the host-wide default.
	const source = project.branchPrefixMode != null ? project : global;
	const mode: BranchPrefixMode = source?.branchPrefixMode ?? "none";
	const customPrefix = source?.branchPrefixCustom ?? null;

	if (mode === "none") return undefined;

	let authorName: string | null = null;
	let githubUsername: string | null = null;
	if (mode === "author") {
		authorName = await getAuthorName();
	} else if (mode === "github") {
		[githubUsername, authorName] = await Promise.all([
			getGitHubUsername(ctx.execGh),
			getAuthorName(),
		]);
	}

	const prefix = resolveBranchPrefix({
		mode,
		customPrefix,
		authorPrefix: authorName,
		githubUsername,
	});
	if (!prefix) return undefined;

	const existingSet = new Set(existingBranches.map((b) => b.toLowerCase()));
	return existingSet.has(prefix.toLowerCase()) ? undefined : prefix;
}
