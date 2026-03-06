import type { ChangedFile, GitChangesStatus } from "shared/changes-types";

export interface GitTaskPayloadMap {
	getStatus: {
		worktreePath: string;
		defaultBranch: string;
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
