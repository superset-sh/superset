import type { ChangedFile, GitChangesStatus } from "shared/changes-types";
import type { PersistedWorktreeBaseBranch } from "../utils/select-effective-base-branch";

export interface GitBranchesResult {
	local: Array<{ branch: string; lastCommitDate: number }>;
	remote: string[];
	defaultBranch: string;
	checkedOutBranches: Record<string, string>;
	worktreeBaseBranch: string | null;
	currentBranch: string | null;
}

interface GitFileContentsBasePayload {
	worktreePath: string;
	filePath: string;
	originalPath: string;
}

export type GitFileContentsPayload =
	| (GitFileContentsBasePayload & {
			category: "against-base";
			defaultBranch: string;
	  })
	| (GitFileContentsBasePayload & { category: "committed"; commitHash: string })
	| (GitFileContentsBasePayload & { category: "staged" })
	| (GitFileContentsBasePayload & { category: "original" });

export interface GitFileVersions {
	original: string | null;
	modified: string | null;
}

export interface GitTaskPayloadMap {
	getStatus: {
		worktreePath: string;
		defaultBranch?: string;
		persistedWorktree: PersistedWorktreeBaseBranch | null;
	};
	getCommitFiles: {
		worktreePath: string;
		commitHash: string;
	};
	getBranches: {
		worktreePath: string;
		persistedWorktree: PersistedWorktreeBaseBranch | null;
	};
	getAheadBehind: {
		repoPath: string;
		defaultBranch: string;
	};
	getFileContents: GitFileContentsPayload;
}

export interface GitTaskResultMap {
	getStatus: GitChangesStatus;
	getCommitFiles: ChangedFile[];
	getBranches: GitBranchesResult;
	getAheadBehind: { ahead: number; behind: number };
	getFileContents: GitFileVersions;
}

export type GitTaskType = keyof GitTaskPayloadMap;
