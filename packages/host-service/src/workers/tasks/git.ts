import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, parse, relative, sep } from "node:path";
import { type ParsedRemote, parseGitRemote } from "@superset/shared/git-remote";
// git/* worker tasks. Handlers build their own SimpleGit — the worker spawns
// the git subprocesses itself, so stdout draining AND parsing leave the
// host-service event loop. Credential env is resolved in-process (it needs
// the credential provider) and crosses as plain data.

import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
	getGitAuthorName,
	type ResolvedGitInfo,
	readGitIdentity,
} from "../../runtime/git/identity.ts";
import { resolveRef } from "../../runtime/git/refs.ts";
import { createUserSimpleGit } from "../../runtime/git/simple-git.ts";
import {
	readWorkspaceRefs,
	type WorkspaceRefsSnapshot,
} from "../../runtime/pull-requests/utils/workspace-refs.ts";
import type { ChangedFile } from "../../trpc/router/git/types.ts";
import type { BaseRefFetchTarget } from "../../trpc/router/git/utils/base-ref-freshness.ts";
import { buildDiffPatch } from "../../trpc/router/git/utils/diff-patch.ts";
import {
	type DiffSide,
	diffSideObjectSpec,
	readDiffSideBlob,
} from "../../trpc/router/git/utils/diff-side-blob.ts";
import {
	type DiffCategory,
	getChangedFilesForDiff,
	getDefaultBranchName,
	loadFileDiffContent,
	mapWithConcurrency,
	resolveDiffCategoryRefs,
} from "../../trpc/router/git/utils/git-helpers.ts";
import type { GitStatusSnapshotComputation } from "../../trpc/router/git/utils/git-status.ts";
import { getGitStatusSnapshot } from "../../trpc/router/git/utils/git-status.ts";
import type { GitStatusPartial } from "../../trpc/router/git/utils/git-status-partial/index.ts";
import { getGitStatusPartial } from "../../trpc/router/git/utils/git-status-partial/index.ts";
import { getAllRepoRemotes } from "../../trpc/router/project/utils/git-remote.ts";
import { addBranchWorktree } from "../../trpc/router/workspace-creation/shared/add-branch-worktree.ts";
import { listWorktreeBranches } from "../../trpc/router/workspace-creation/shared/branch-search.ts";
import { enablePushAutoSetupRemote } from "../../trpc/router/workspace-creation/shared/git-config.ts";
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
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
		return getGitStatusSnapshot({ git, worktreePath, baseBranch });
	},
});

export const gitStatusPartialTask = defineWorkerTask<
	{ worktreePath: string; paths: string[]; gitEnv: GitTaskEnv },
	GitStatusPartial
>({
	type: "git/getStatusPartial",
	handler: async ({ worktreePath, paths, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
		return getGitStatusPartial({ git, worktreePath, paths });
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
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
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
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
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
			createUserSimpleGit(worktreePath, { env: gitEnv }),
			category,
			{ baseBranch, commitHash, fromHash },
		);

		const diffs = await mapWithConcurrency(
			paths,
			DIFF_BULK_CONCURRENCY,
			async (path) => {
				const git = createUserSimpleGit(worktreePath, { env: gitEnv });
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
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
		const refs = await resolveDiffCategoryRefs(git, category, {
			baseBranch,
			commitHash,
			fromHash,
		});
		const patch = await buildDiffPatch({
			cwd: worktreePath,
			env: gitEnv,
			category,
			refs,
			paths,
			untrackedPaths,
		});
		return { patch };
	},
});

export type DiffSideBlobResult =
	| { kind: "missing" }
	| {
			kind: "bytes";
			/** base64; null when the blob is over the cap */
			content: string | null;
			byteLength: number;
			exceededLimit: boolean;
	  };

export const gitDiffSideBlobTask = defineWorkerTask<
	{
		worktreePath: string;
		category: DiffCategory;
		side: DiffSide;
		path: string;
		maxBytes: number;
		baseBranch?: string;
		commitHash?: string;
		fromHash?: string;
		gitEnv: GitTaskEnv;
	},
	DiffSideBlobResult
>({
	type: "git/readDiffSideBlob",
	handler: async ({
		worktreePath,
		category,
		side,
		path,
		maxBytes,
		baseBranch,
		commitHash,
		fromHash,
		gitEnv,
	}) => {
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
		const refs = await resolveDiffCategoryRefs(git, category, {
			baseBranch,
			commitHash,
			fromHash,
		});
		const spec = diffSideObjectSpec(category, side, path, refs);
		if (!spec) return { kind: "missing" };
		const blob = await readDiffSideBlob(git, spec, maxBytes);
		if (blob.kind === "missing") return { kind: "missing" };
		return {
			kind: "bytes",
			content: blob.content?.toString("base64") ?? null,
			byteLength: blob.byteLength,
			exceededLimit: blob.exceededLimit,
		};
	},
});

export const gitWorkspaceRefsTask = defineWorkerTask<
	{ worktreePath: string; gitEnv: GitTaskEnv },
	WorkspaceRefsSnapshot
>({
	type: "git/readWorkspaceRefs",
	handler: async ({ worktreePath, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
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

/**
 * Repository-scoped `user.name`, unlike `gitIdentityTask` (which reads the
 * home-directory/global identity). A repo can locally override `user.name`,
 * so branch-prefix resolution must read the same repo `create` binds its
 * on-loop client to — reading the global identity instead would let the
 * "author" prefix disagree between the branch `create` makes and the one an
 * AI/derived rename or live preview later proposes for it.
 */
export const gitAuthorNameTask = defineWorkerTask<
	{ worktreePath: string },
	string | null
>({
	type: "git/readAuthorName",
	handler: ({ worktreePath }) =>
		getGitAuthorName(createUserSimpleGit(worktreePath)),
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
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
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
	{
		repoPath: string;
		worktreePath: string;
		gitEnv: GitTaskEnv;
		/** false lets git refuse a worktree with uncommitted changes. */
		force?: boolean;
	},
	{ stillRegistered: boolean; removeError?: string }
>({
	type: "git/removeWorktree",
	// This task outlives its caller's budget in the field (HOST-SERVICE-17,
	// HOST-SERVICE-47) and the timeout named only the budget. Its steps stall
	// for unrelated reasons, so each announces itself before starting and the
	// pool names the last one in the timeout error.
	handler: async (
		{ repoPath, worktreePath, gitEnv, force = true },
		reportPhase,
	) => {
		// Labelled from the first statement so every moment of the handler
		// falls under some phase — an unlabelled timeout would be
		// indistinguishable from one reported by a build without this.
		reportPhase?.("resolve-path");
		const git = createUserSimpleGit(repoPath, { env: gitEnv });
		// Remove against git's canonical path so a symlinked stored path
		// (macOS `/var` → `/private/var`) still matches its registration.
		// `realpathSync.native` is a blocking syscall, hence its own phase.
		const target = normalizeWorktreePath(worktreePath);
		// The registry read below decides "registered or not" (the command's
		// exit text is locale- and version-dependent), but registration is
		// not the whole story: git can unregister the worktree and still fail
		// partway through its recursive delete (#6730). Keep the error — it
		// is the only record of why files were left behind — and let the
		// caller re-check the disk. `--force --force` also unregisters a
		// worktree whose directory is already gone, so no separate prune
		// (which would clobber other stale worktrees' metadata) is needed.
		reportPhase?.("worktree-remove");
		let removeError: string | undefined;
		await git
			.raw(
				force
					? ["worktree", "remove", "--force", "--force", target]
					: ["worktree", "remove", target],
			)
			.catch((err: unknown) => {
				removeError = (err instanceof Error ? err.message : String(err)).trim();
				console.warn("[git/removeWorktree] git worktree remove failed", {
					target,
					error: removeError,
				});
			});
		// A `worktree list` failure throws out of the task: the post-remove
		// state is unknown and the caller must not treat it as removed.
		reportPhase?.("worktree-list");
		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		return {
			stillRegistered: parseWorktreeList(raw).some(
				(w) => normalizeWorktreePath(w.path) === target,
			),
			removeError,
		};
	},
});

export const gitDeleteBranchTask = defineWorkerTask<
	{ repoPath: string; branch: string; gitEnv: GitTaskEnv },
	{ deleted: boolean }
>({
	type: "git/deleteLocalBranch",
	handler: async ({ repoPath, branch, gitEnv }) => {
		const git = createUserSimpleGit(repoPath, { env: gitEnv });
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

/**
 * Whether an automatically named branch can still be renamed: checked out
 * in the worktree, no upstream, and no remote branch of the same name.
 */
export const gitAutomaticBranchRenamableTask = defineWorkerTask<
	{ worktreePath: string; branch: string; gitEnv: GitTaskEnv },
	{ renamable: boolean }
>({
	type: "git/automaticBranchRenamable",
	handler: async ({ worktreePath, branch, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
		const [head, upstream, remoteBranches] = await Promise.all([
			git.raw(["branch", "--show-current"]),
			git.raw(["for-each-ref", "--format=%(upstream)", `refs/heads/${branch}`]),
			git.raw(["for-each-ref", "--format=%(refname)", "refs/remotes"]),
		]);
		return {
			renamable:
				head.trim() === branch &&
				!upstream.trim() &&
				!remoteBranches
					.split("\n")
					.some((ref) => ref.replace(/^refs\/remotes\/[^/]+\//, "") === branch),
		};
	},
});

export const gitRenameBranchTask = defineWorkerTask<
	{ worktreePath: string; from: string; to: string; gitEnv: GitTaskEnv },
	void
>({
	type: "git/renameBranch",
	handler: async ({ worktreePath, from, to, gitEnv }) => {
		await createUserSimpleGit(worktreePath, { env: gitEnv }).raw([
			"branch",
			"-m",
			from,
			to,
		]);
	},
});

export const gitStagePathsTask = defineWorkerTask<
	{
		worktreePath: string;
		paths: string[];
		action: "stage" | "unstage";
		gitEnv: GitTaskEnv;
	},
	{ success: true }
>({
	type: "git/stagePaths",
	handler: async ({ worktreePath, paths, action, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
		// Paths come from status output, not from a pathspec the user typed;
		// without this, a name like `:(glob)**` would match the whole tree.
		const command = action === "stage" ? ["add", "-A"] : ["reset", "HEAD"];
		await git.raw(["--literal-pathspecs", ...command, "--", ...paths]);
		return { success: true };
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
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
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
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
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
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
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

export type RestoreWorktreeResult =
	| { kind: "restored" }
	| { kind: "already-registered" }
	| { kind: "registered-elsewhere"; path: string }
	| { kind: "path-occupied" }
	| { kind: "branch-missing" };

/** Re-create an archived workspace's worktree on its existing branch. */
export const gitRestoreWorktreeTask = defineWorkerTask<
	{
		repoPath: string;
		worktreePath: string;
		branch: string;
		remoteName: string;
		sparsePaths: string[];
		gitEnv: GitTaskEnv;
	},
	RestoreWorktreeResult
>({
	type: "git/restoreWorktree",
	handler: async ({
		repoPath,
		worktreePath,
		branch,
		remoteName,
		sparsePaths,
		gitEnv,
	}) => {
		const git = createUserSimpleGit(repoPath, { env: gitEnv });
		await git
			.raw(["worktree", "prune"])
			.catch((err: unknown) =>
				console.warn("[git/restoreWorktree] worktree prune failed:", err),
			);
		const registeredPath = (await listWorktreeBranches(git)).worktreeMap.get(
			branch,
		);
		if (registeredPath) {
			return normalizeWorktreePath(registeredPath) ===
				normalizeWorktreePath(worktreePath)
				? { kind: "already-registered" }
				: { kind: "registered-elsewhere", path: registeredPath };
		}
		if (existsSync(worktreePath)) return { kind: "path-occupied" };

		const ref = await resolveRef(git, branch, { remote: remoteName });
		if (ref?.kind !== "local" && ref?.kind !== "remote-tracking") {
			return { kind: "branch-missing" };
		}
		mkdirSync(dirname(worktreePath), { recursive: true });
		await addBranchWorktree({
			git,
			plan: {
				branch: ref.shortName,
				startPoint: ref,
				usedExistingBranch: true,
			},
			worktreePath,
			sparsePaths,
		});
		await enablePushAutoSetupRemote(git, worktreePath, "[git/restoreWorktree]");
		return { kind: "restored" };
	},
});

export interface GitStorageIdentity {
	commonDir: string;
	device: number;
	inode: number;
}
async function physicalGitDirectory(
	cwd: string,
	operand: string,
): Promise<string> {
	const root = parse(operand).root;
	let current = root ? await realpath(root) : cwd;
	for (const part of operand
		.slice(root.length)
		.split(process.platform === "win32" ? /[\\/]/ : /\//)) {
		if (part && part !== ".")
			current = await realpath(`${current}${sep}${part}`);
	}
	return current;
}
async function readGitStorageIdentity(
	git: ReturnType<typeof createUserSimpleGit>,
	repoPath: string,
	prefix?: string[],
): Promise<GitStorageIdentity> {
	const common = (
		await (prefix
			? git.raw([...prefix, "rev-parse", "--git-common-dir"])
			: git.revparse(["--git-common-dir"]))
	).trim();
	if (!common) throw new Error("Missing Git common directory");
	const commonDir = await physicalGitDirectory(
		await realpath(repoPath),
		common,
	);
	const info = await stat(commonDir);
	if (!info.isDirectory()) throw new Error("Invalid Git common directory");
	return { commonDir, device: info.dev, inode: info.ino };
}
export const gitResolveRepositoryTask = defineWorkerTask<
	{
		repoPath: string;
		repoUrl?: string | null;
		includeStorage?: boolean;
		gitEnv?: GitTaskEnv;
	},
	{
		repoPath: string;
		remotes: Array<[string, ParsedRemote]>;
		storage?: GitStorageIdentity;
	}
>({
	type: "git/resolveRepository",
	handler: async ({ repoPath, repoUrl, includeStorage, gitEnv }) => {
		let git = createUserSimpleGit(repoPath, { env: gitEnv });
		const root = (await git.revparse(["--show-toplevel"])).trim();
		git = createUserSimpleGit(root, { env: gitEnv });
		return {
			repoPath: root,
			remotes: await getAllRepoRemotes(git, repoUrl),
			...(includeStorage
				? { storage: await readGitStorageIdentity(git, root) }
				: {}),
		};
	},
});
export const gitConfirmNoPlatformRemotesTask = defineWorkerTask<
	{ repoPath: string },
	{ repoPath: string; noPlatformRemote: boolean }
>({
	type: "git/confirmNoPlatformRemotes",
	handler: async ({ repoPath }) => {
		const root = (
			await createUserSimpleGit(repoPath).revparse(["--show-toplevel"])
		).trim();
		if (!root) throw new Error("Missing Git checkout root");
		const key = `remote.superset-inspection-${randomUUID()}.url`;
		const value = "SUPERSET_REMOTE_INSPECTION_SENTINEL";
		const output = await createUserSimpleGit(root).raw([
			"-c",
			`${key}=${value}`,
			"config",
			"--null",
			"--get-regexp",
			String.raw`^remote\..*\.url$`,
		]);
		if (!output.endsWith("\0"))
			throw new Error("Incomplete Git remote inspection");
		let sentinelCount = 0;
		let noPlatformRemote = true;
		for (const record of output.slice(0, -1).split("\0")) {
			const separator = record.indexOf("\n");
			const name = record.slice(0, separator);
			if (separator < 0 || !/^remote\.(.+)\.url$/.test(name))
				throw new Error("Invalid Git remote inspection");
			const url = record.slice(separator + 1);
			if (name === key) {
				if (url !== value)
					throw new Error("Invalid Git remote inspection sentinel");
				sentinelCount++;
			} else if (parseGitRemote(url)) noPlatformRemote = false;
		}
		if (sentinelCount !== 1)
			throw new Error("Missing Git remote inspection sentinel");
		return { repoPath: root, noPlatformRemote };
	},
});
export const gitGitlabPushHeadTask = defineWorkerTask<
	{
		worktreePath: string;
		branch: string;
		remoteName: string;
		gitEnv?: GitTaskEnv;
	},
	{ pushUrl: string }
>({
	type: "git/gitlabPushHead",
	handler: async ({ worktreePath, branch, remoteName, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath, { env: gitEnv });
		const config = async (key: string) =>
			(await git.raw(["config", key]).catch(() => "")).trim();
		const remote =
			(await config(`branch.${branch}.pushRemote`)) ||
			(await config("remote.pushDefault")) ||
			(await config(`branch.${branch}.remote`)) ||
			((await git.getRemotes()).some((remote) => remote.name === "origin")
				? "origin"
				: remoteName);
		return {
			pushUrl: await git
				.raw(["remote", "get-url", "--push", remote])
				.catch(() => ""),
		};
	},
});
export const gitGitlabRawTask = defineWorkerTask<
	{
		repoPath: string;
		storage: GitStorageIdentity;
		argv: string[];
		gitEnv?: GitTaskEnv;
	},
	string
>({
	type: "git/gitlabRaw",
	execution: "worker-only-nonreplay",
	mutationScope: ({ storage }) => storage.commonDir,
	handler: async ({ repoPath, storage, argv, gitEnv }) => {
		const git = createUserSimpleGit(repoPath, { env: gitEnv });
		const root = (await git.revparse(["--show-toplevel"])).trim();
		let effectiveCwd = await realpath(repoPath);
		if ((await realpath(root)) !== effectiveCwd)
			throw new Error("Git checkout root changed");
		const current = await readGitStorageIdentity(git, root);
		if (
			current.commonDir !== storage.commonDir ||
			current.device !== storage.device ||
			current.inode !== storage.inode
		)
			throw new Error("Git common storage changed");
		let commandIndex = 0;
		while (argv[commandIndex] === "-C" || argv[commandIndex] === "-c") {
			const option = argv[commandIndex],
				value = argv[commandIndex + 1];
			if (typeof value !== "string" || (option === "-c" && !value))
				throw new Error("Malformed Git command prefix");
			if (option === "-C" && value)
				effectiveCwd = await physicalGitDirectory(effectiveCwd, value);
			commandIndex += 2;
		}
		const command = argv[commandIndex];
		if (!command || command.startsWith("-"))
			throw new Error("Unsupported Git command prefix");
		if (commandIndex) {
			const prefix = argv.slice(0, commandIndex);
			const effectiveRoot = await realpath(
				(await git.raw([...prefix, "rev-parse", "--show-toplevel"])).trim(),
			);
			const rootRelative = relative(effectiveRoot, effectiveCwd);
			if (
				isAbsolute(rootRelative) ||
				rootRelative === ".." ||
				rootRelative.startsWith(`..${sep}`)
			)
				throw new Error("Git effective checkout root changed");
			const effective = await readGitStorageIdentity(git, effectiveCwd, prefix);
			if (
				effective.commonDir !== storage.commonDir ||
				effective.device !== storage.device ||
				effective.inode !== storage.inode
			)
				throw new Error("Git effective common storage changed");
		}
		return git.raw(argv);
	},
});

export const gitTasks = [
	gitResolveRepositoryTask,
	gitConfirmNoPlatformRemotesTask,
	gitGitlabPushHeadTask,
	gitGitlabRawTask,
	gitStatusSnapshotTask,
	gitStatusPartialTask,
	gitFetchBaseRefTask,
	gitCommitFilesTask,
	gitDiffBulkTask,
	gitDiffPatchTask,
	gitDiffSideBlobTask,
	gitWorkspaceRefsTask,
	gitIdentityTask,
	gitAuthorNameTask,
	gitWorktreeStateTask,
	gitWorktreeRemoveTask,
	gitDeleteBranchTask,
	gitAutomaticBranchRenamableTask,
	gitRenameBranchTask,
	gitStagePathsTask,
	gitCommitTask,
	gitPushTask,
	gitPrHeadBaseTask,
	gitRestoreWorktreeTask,
];
