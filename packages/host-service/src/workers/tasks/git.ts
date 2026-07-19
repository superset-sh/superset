// git/* worker tasks. Handlers build their own SimpleGit — the worker spawns
// the git subprocesses itself, so stdout draining AND parsing leave the
// host-service event loop. Credential env is resolved in-process (it needs
// the credential provider) and crosses as plain data.

import { createUserSimpleGit } from "../../runtime/git/simple-git.ts";
import type { ChangedFile } from "../../trpc/router/git/types.ts";
import type { BaseRefFetchTarget } from "../../trpc/router/git/utils/base-ref-freshness.ts";
import { getChangedFilesForDiff } from "../../trpc/router/git/utils/git-helpers.ts";
import type { GitStatusSnapshotComputation } from "../../trpc/router/git/utils/git-status.ts";
import { getGitStatusSnapshot } from "../../trpc/router/git/utils/git-status.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

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

export const gitTasks = [
	gitStatusSnapshotTask,
	gitFetchBaseRefTask,
	gitCommitFilesTask,
];
