import type { FileStatus } from "../../components/StatusIndicator";

export type DiffRef =
	| { kind: "against-base"; baseBranch: string | null }
	| { kind: "uncommitted" }
	| { kind: "commit"; commitHash: string; fromHash?: string };

export type DiffFileSource =
	| { kind: "against-base"; baseBranch: string | null }
	| { kind: "staged" }
	| { kind: "unstaged" }
	| { kind: "commit"; commitHash: string; fromHash?: string };

export interface ChangesetFile {
	path: string;
	oldPath?: string;
	status: FileStatus;
	additions: number;
	deletions: number;
	source: DiffFileSource;
}
