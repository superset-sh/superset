import type { ChangedFile, GitChangesStatus } from "shared/changes-types";
import type { PersistedWorktreeBaseBranch } from "../utils/select-effective-base-branch";

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
}

export interface GitTaskResultMap {
	getStatus: GitChangesStatus;
	getCommitFiles: ChangedFile[];
}

export type GitTaskType = keyof GitTaskPayloadMap;
