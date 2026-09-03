// git/* worker tasks. Handlers build their own SimpleGit — the worker spawns
// the git subprocesses itself, so stdout draining AND parsing leave the
// host-service event loop. Credential env is resolved in-process (it needs
// the credential provider) and crosses as plain data.

import {
	type ResolvedGitInfo,
	readGitIdentity,
} from "../../runtime/git/identity.ts";
import { createUserSimpleGit } from "../../runtime/git/simple-git.ts";
import {
	readWorkspaceRefs,
	type WorkspaceRefsSnapshot,
} from "../../runtime/pull-requests/utils/workspace-refs.ts";
import type { ChangedFile } from "../../trpc/router/git/types.ts";
import type { BaseRefFetchTarget } from "../../trpc/router/git/utils/base-ref-freshness.ts";
import { buildDiffPatch } from "../../trpc/router/git/utils/diff-patch.ts";
import {
	type DiffCategory,
	getChangedFilesForDiff,
	getDefaultBranchName,
	loadFileDiffContent,
	mapWithConcurrency,
	resolveBaseComparison,
	resolveDiffCategoryRefs,
} from "../../trpc/router/git/utils/git-helpers.ts";
import type { GitStatusSnapshotComputation } from "../../trpc/router/git/utils/git-status.ts";
import { getGitStatusSnapshot } from "../../trpc/router/git/utils/git-status.ts";
import {
	type PrContext,
	type PrContextPatch,
	parseCommitLog,
	parseNumstat,
	selectPatchPathspec,
	slicePatch,
} from "../../trpc/router/pull-requests/utils/pr-context.ts";
import {
	normalizeWorktreePath,
	parseWorktreeList,
} from "../../trpc/router/workspace-creation/shared/worktree-list.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

// How many `git show` pairs run at once for a bulk diff request. Each pair
// is its own SimpleGit instance so slots genuinely run concurrently
// (simple-git serializes commands within one instance).
const DIFF_BULK_CONCURRENCY = 8;

export interface GitTaskEnv {
	[key: string]: string;
}

export const gitStatusSnapshotTask = defineWorkerTask<
	{ worktreePath: string; baseBranch?: string; gitEnv: GitTaskEnv },
	GitStatusSnapshotComputation
>({
	type: "git/getStatusSnapshot",
	handler: async ({ worktreePath, baseBranch, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		return getGitStatusSnapshot({ git, worktreePath, baseBranch });
	},
});

export const gitFetchBaseRefTask = defineWorkerTask<
	{
		worktreePath: string;
		target: BaseRefFetchTarget;
		gitEnv: GitTaskEnv;
	},
	void
>({
	type: "git/fetchBaseRef",
	handler: async ({ worktreePath, target, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		await git.fetch([target.remote, target.branch, "--quiet", "--no-tags"]);
	},
});

export const gitCommitFilesTask = defineWorkerTask<
	{
		worktreePath: string;
		commitHash: string;
		fromHash?: string;
		gitEnv: GitTaskEnv;
	},
	ChangedFile[]
>({
	type: "git/getCommitFiles",
	handler: async ({ worktreePath, commitHash, fromHash, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const from = fromHash ? fromHash : `${commitHash}^`;
		return getChangedFilesForDiff(git, [from, commitHash]);
	},
});

// Bulk sibling of the single-file diff path: resolves the category's shared
// refs once, then loads every requested file's diff with bounded
// concurrency — all inside this worker, so a several-hundred-file changeset
// never spawns its `git show` processes on the host-service event loop.
export const gitDiffBulkTask = defineWorkerTask<
	{
		worktreePath: string;
		paths: string[];
		category: DiffCategory;
		baseBranch?: string;
		commitHash?: string;
		fromHash?: string;
		gitEnv: GitTaskEnv;
	},
	{
		diffs: Array<{
			path: string;
			oldFile: { name: string; contents: string };
			newFile: { name: string; contents: string };
		}>;
	}
>({
	type: "git/getDiffBulk",
	handler: async ({
		worktreePath,
		paths,
		category,
		baseBranch,
		commitHash,
		fromHash,
		gitEnv,
	}) => {
		const refs = await resolveDiffCategoryRefs(
			createUserSimpleGit(worktreePath).env(gitEnv),
			category,
			{ baseBranch, commitHash, fromHash },
		);

		const diffs = await mapWithConcurrency(
			paths,
			DIFF_BULK_CONCURRENCY,
			async (path) => {
				const git = createUserSimpleGit(worktreePath).env(gitEnv);
				const { oldFile, newFile } = await loadFileDiffContent(
					git,
					worktreePath,
					category,
					path,
					refs,
				);
				return { path, oldFile, newFile };
			},
		);

		return { diffs };
	},
});

// Whole-category patch for the Changes pane. `git diff` runs here rather
// than on the host-service event loop, and the patch is a fraction of the
// bytes `getDiffBulk` moves — hunks with three lines of context instead of
// two complete copies of every changed file.
export const gitDiffPatchTask = defineWorkerTask<
	{
		worktreePath: string;
		category: DiffCategory;
		paths?: string[];
		untrackedPaths?: string[];
		baseBranch?: string;
		commitHash?: string;
		fromHash?: string;
		gitEnv: GitTaskEnv;
	},
	{ patch: string }
>({
	type: "git/getDiffPatch",
	handler: async ({
		worktreePath,
		category,
		paths,
		untrackedPaths,
		baseBranch,
		commitHash,
		fromHash,
		gitEnv,
	}) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const refs = await resolveDiffCategoryRefs(git, category, {
			baseBranch,
			commitHash,
			fromHash,
		});
		const patch = await buildDiffPatch(git, {
			category,
			refs,
			paths,
			untrackedPaths,
		});
		return { patch };
	},
});

export const gitWorkspaceRefsTask = defineWorkerTask<
	{ worktreePath: string; gitEnv: GitTaskEnv },
	WorkspaceRefsSnapshot
>({
	type: "git/readWorkspaceRefs",
	handler: async ({ worktreePath, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		return readWorkspaceRefs(git);
	},
});

export const gitIdentityTask = defineWorkerTask<
	{ shellEnv: GitTaskEnv },
	ResolvedGitInfo
>({
	type: "git/readGitIdentity",
	handler: ({ shellEnv }) => readGitIdentity(shellEnv),
});

// Delete-preview + destroy-preflight state for workspace cleanup.
// Unpushed-commit detection uses `rev-list --not --remotes` so brand-new
// branches with no upstream still report unpushed commits correctly.
export const gitWorktreeStateTask = defineWorkerTask<
	{
		worktreePath: string;
		gitEnv: GitTaskEnv;
		// Session repos have no remote, so `--not --remotes` counts every
		// commit and the initial scaffold commit would read as "unpushed"
		// forever. This treats exactly one commit as the empty baseline.
		ignoreInitialCommit?: boolean;
	},
	{ hasChanges: boolean; hasUnpushedCommits: boolean }
>({
	type: "git/worktreeState",
	handler: async ({ worktreePath, gitEnv, ignoreInitialCommit }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const status = await git.status();
		let hasUnpushedCommits = false;
		try {
			const result = await git.raw([
				"rev-list",
				"--count",
				"HEAD",
				"--not",
				"--remotes",
			]);
			const count = Number.parseInt(result.trim(), 10);
			hasUnpushedCommits =
				Number.isFinite(count) && count > (ignoreInitialCommit ? 1 : 0);
		} catch {
			// Leave false — `rev-list` failure isn't a signal we can act on.
		}
		return { hasChanges: !status.isClean(), hasUnpushedCommits };
	},
});

export const gitWorktreeRemoveTask = defineWorkerTask<
	{ repoPath: string; worktreePath: string; gitEnv: GitTaskEnv },
	{ stillRegistered: boolean }
>({
	type: "git/removeWorktree",
	// This task outlives its caller's budget in the field (HOST-SERVICE-17,
	// HOST-SERVICE-47) and the timeout named only the budget. Its steps stall
	// for unrelated reasons, so each announces itself before starting and the
	// pool names the last one in the timeout error.
	handler: async ({ repoPath, worktreePath, gitEnv }, reportPhase) => {
		// Labelled from the first statement so every moment of the handler
		// falls under some phase — an unlabelled timeout would be
		// indistinguishable from one reported by a build without this.
		reportPhase?.("resolve-path");
		const git = createUserSimpleGit(repoPath).env(gitEnv);
		// Remove against git's canonical path so a symlinked stored path
		// (macOS `/var` → `/private/var`) still matches its registration.
		// `realpathSync.native` is a blocking syscall, hence its own phase.
		const target = normalizeWorktreePath(worktreePath);
		// Best-effort: the registry read below is authoritative, not the
		// command's locale- and version-dependent exit text. `--force --force`
		// also unregisters a worktree whose directory is already gone, so no
		// separate prune (which would clobber other stale worktrees' metadata)
		// is needed.
		reportPhase?.("worktree-remove");
		await git
			.raw(["worktree", "remove", "--force", "--force", target])
			.catch(() => {});
		// A `worktree list` failure throws out of the task: the post-remove
		// state is unknown and the caller must not treat it as removed.
		reportPhase?.("worktree-list");
		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		return {
			stillRegistered: parseWorktreeList(raw).some(
				(w) => normalizeWorktreePath(w.path) === target,
			),
		};
	},
});

export const gitDeleteBranchTask = defineWorkerTask<
	{ repoPath: string; branch: string; gitEnv: GitTaskEnv },
	{ deleted: boolean }
>({
	type: "git/deleteLocalBranch",
	handler: async ({ repoPath, branch, gitEnv }) => {
		const git = createUserSimpleGit(repoPath).env(gitEnv);
		// `branch --list` exits 0 whether or not the branch exists (empty
		// output when absent), so an absent ref — renamed, pruned, or never
		// materialized — already satisfies the goal, while a thrown failure
		// propagates instead of being misread as "already deleted".
		const listed = await git.raw(["branch", "--list", branch]);
		if (listed.trim().length === 0) return { deleted: false };
		await git.raw(["branch", "-D", branch]);
		return { deleted: true };
	},
});

export const gitCommitTask = defineWorkerTask<
	{
		worktreePath: string;
		message: string;
		stageAll: boolean;
		gitEnv: GitTaskEnv;
	},
	{ ok: true; hash: string } | { ok: false; reason: "nothing-to-commit" }
>({
	type: "git/commit",
	handler: async ({ worktreePath, message, stageAll, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		if (stageAll) await git.raw(["add", "-A"]);
		// Read the staged file list instead of `--quiet` exit codes:
		// simple-git treats a non-zero exit with empty stderr as success, so
		// `diff --quiet`'s exit-1 signal never surfaces as a rejection.
		const staged = (await git.raw(["diff", "--cached", "--name-only"])).trim();
		if (!staged) return { ok: false, reason: "nothing-to-commit" };
		await git.raw(["commit", "-m", message]);
		const hash = (await git.revparse(["HEAD"])).trim();
		return { ok: true, hash };
	},
});

export const gitPushTask = defineWorkerTask<
	{
		worktreePath: string;
		/** The workspace's linked PR head branch, when one exists. */
		linkedPrHeadBranch: string | null;
		gitEnv: GitTaskEnv;
	},
	{ ok: true } | { ok: false; reason: "detached-head" | "no-remote" }
>({
	type: "git/push",
	handler: async ({ worktreePath, linkedPrHeadBranch, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const branch = (
			await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
		).trim();
		if (!branch || branch === "HEAD")
			return { ok: false, reason: "detached-head" };

		// Workspace branches fork from the base branch, so git's
		// autoSetupMerge usually leaves them tracking e.g. origin/main — a
		// plain `git push` refuses that name mismatch, and honoring it would
		// mean pushing to main. But a different-name upstream is deliberate
		// for PR-checkout workspaces (local alice/feature-x tracking the PR
		// head feature-x), so the linked PR's head branch decides: matching
		// upstream → push to it; anything else → publish under the branch's
		// own name and re-point the upstream there (v1's push flow).
		const upstreamRef = await git
			.raw(["rev-parse", "--abbrev-ref", "@{upstream}"])
			.then(
				(ref) => ref.trim(),
				() => null,
			);
		// `branch.<name>.remote` distinguishes remote tracking from tracking
		// a local branch ("."), where @{upstream} prints a bare branch name
		// that must never be mistaken for a remote.
		const configuredRemote = (
			await git.raw(["config", `branch.${branch}.remote`]).catch(() => "")
		).trim();
		const hasRemoteUpstream =
			upstreamRef != null && !!configuredRemote && configuredRemote !== ".";
		const upstreamBranch = !hasRemoteUpstream
			? null
			: upstreamRef.startsWith(`${configuredRemote}/`)
				? upstreamRef.slice(configuredRemote.length + 1)
				: upstreamRef.split("/").slice(1).join("/");

		if (hasRemoteUpstream && upstreamBranch === branch) {
			await git.raw(["push"]);
			return { ok: true };
		}

		const remotes = await git.getRemotes(false).catch(() => []);
		const fallbackRemote =
			remotes.find((r) => r.name === "origin")?.name ?? remotes[0]?.name;
		const remote = hasRemoteUpstream ? configuredRemote : fallbackRemote;
		if (!remote) return { ok: false, reason: "no-remote" };

		if (
			hasRemoteUpstream &&
			upstreamBranch != null &&
			linkedPrHeadBranch === upstreamBranch
		) {
			// PR checkout: the upstream deliberately points at the PR's head
			// under a different local name. Push there and keep the tracking.
			await git.raw(["push", remote, `HEAD:refs/heads/${upstreamBranch}`]);
			return { ok: true };
		}

		// HEAD refspec avoids resolving the branch name as a local ref —
		// more reliable in worktrees (mirrors v1's pushWithSetUpstream).
		await git.raw([
			"push",
			"--set-upstream",
			remote,
			`HEAD:refs/heads/${branch}`,
		]);
		return { ok: true };
	},
});

export const gitPrHeadBaseTask = defineWorkerTask<
	{ worktreePath: string; gitEnv: GitTaskEnv },
	{
		head: string | null;
		configuredBase: string | null;
		defaultBranch: string | null;
	}
>({
	type: "git/prHeadBase",
	handler: async ({ worktreePath, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const rawHead = (
			await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
		).trim();
		const head = !rawHead || rawHead === "HEAD" ? null : rawHead;
		const configuredBase = head
			? (
					await git.raw(["config", `branch.${head}.base`]).catch(() => "")
				).trim() || null
			: null;
		return {
			head,
			configuredBase,
			defaultBranch: await getDefaultBranchName(git),
		};
	},
});

export type GitPrContextResult =
	| { ok: true; context: PrContext }
	| { ok: false; reason: "detached-head" | "no-base" | "on-base" };

// Everything the create-PR agent prompt needs about the branch, read in one
// worker pass: the commits ahead of the configured base (falling back to the
// repo default), a per-file numstat, and a byte-budgeted patch with generated
// files left out. Base resolution mirrors gitPrHeadBaseTask/createForWorkspace
// so the prompt describes the same range the PR will open against, and the
// range starts at the merge base so work that landed on the base after the
// fork doesn't read as part of this branch.
export const gitPrContextTask = defineWorkerTask<
	{ worktreePath: string; gitEnv: GitTaskEnv; patchByteBudget?: number },
	GitPrContextResult
>({
	type: "git/prContext",
	handler: async ({ worktreePath, gitEnv, patchByteBudget }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const head = (
			await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
		).trim();
		if (!head || head === "HEAD") return { ok: false, reason: "detached-head" };

		const configuredBase = (
			await git.raw(["config", `branch.${head}.base`]).catch(() => "")
		).trim();
		const baseName = (configuredBase || (await getDefaultBranchName(git)) || "")
			.replace(/^origin\//, "")
			.trim();
		if (!baseName) return { ok: false, reason: "no-base" };
		if (baseName === head) return { ok: false, reason: "on-base" };

		// Prefer the base's upstream ref (what a fetch keeps current); a repo
		// with no remote for it still has the local branch.
		const comparison = await resolveBaseComparison(git, baseName);
		let baseRef: string | null = null;
		for (const candidate of [comparison?.baseRef, baseName]) {
			if (!candidate) continue;
			// No `--quiet`: simple-git reads a non-zero exit with empty stderr
			// as success, so the failure must keep its message.
			const ok = await git
				.raw(["rev-parse", "--verify", `${candidate}^{commit}`])
				.then(() => true)
				.catch(() => false);
			if (ok) {
				baseRef = candidate;
				break;
			}
		}
		if (!baseRef) return { ok: false, reason: "no-base" };
		const mergeBase = (
			await git.raw(["merge-base", baseRef, "HEAD"]).catch(() => baseRef)
		).trim();

		const commits = parseCommitLog(
			await git.raw([
				"log",
				`${mergeBase}..HEAD`,
				"--format=%H%x1f%h%x1f%s%x1f%b%x1e",
			]),
		);
		const files = parseNumstat(
			await git.raw([
				"diff",
				"--numstat",
				"-z",
				"--find-renames",
				mergeBase,
				"HEAD",
			]),
		);

		const pathspec = selectPatchPathspec(files);
		let patch: PrContextPatch;
		if (pathspec === null) {
			const sourceFiles = files.filter((file) => !file.generated).length;
			patch = {
				text: "",
				includedFiles: 0,
				omittedFiles: sourceFiles,
				truncated: sourceFiles > 0,
			};
		} else {
			patch = slicePatch(
				await git.raw([
					"diff",
					"--no-color",
					"--no-ext-diff",
					"--find-renames",
					"--unified=3",
					mergeBase,
					"HEAD",
					"--",
					...pathspec,
				]),
				patchByteBudget,
			);
		}

		const status = await git.raw(["status", "--porcelain"]).catch(() => "");
		const unpushed = await git
			.raw(["rev-list", "--count", "@{upstream}..HEAD"])
			.then((raw) => Number.parseInt(raw.trim(), 10))
			.catch(() => null);

		return {
			ok: true,
			context: {
				head,
				base: { name: baseName, ref: baseRef },
				commits,
				files,
				patch,
				hasUncommitted: status.trim().length > 0,
				unpushedCommits:
					unpushed !== null && Number.isFinite(unpushed) ? unpushed : null,
			},
		};
	},
});

export const gitTasks = [
	gitStatusSnapshotTask,
	gitFetchBaseRefTask,
	gitCommitFilesTask,
	gitDiffBulkTask,
	gitDiffPatchTask,
	gitWorkspaceRefsTask,
	gitIdentityTask,
	gitWorktreeStateTask,
	gitWorktreeRemoveTask,
	gitDeleteBranchTask,
	gitCommitTask,
	gitPushTask,
	gitPrHeadBaseTask,
	gitPrContextTask,
];
