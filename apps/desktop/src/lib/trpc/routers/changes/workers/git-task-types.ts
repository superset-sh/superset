import type {
	ChangedFile,
	CommitInfo,
	GitChangesStatus,
} from "shared/changes-types";

export interface GitTaskPayloadMap {
	getStatus: {
		worktreePath: string;
		defaultBranch: string;
	};
	getCommitFiles: {
		worktreePath: string;
		commitHash: string;
	};
	getHistory: {
		worktreePath: string;
		maxCount: number;
		skip: number;
	};
}

export interface GitTaskResultMap {
	getStatus: GitChangesStatus;
	getCommitFiles: ChangedFile[];
	getHistory: CommitInfo[];
}

export type GitTaskType = keyof GitTaskPayloadMap;
