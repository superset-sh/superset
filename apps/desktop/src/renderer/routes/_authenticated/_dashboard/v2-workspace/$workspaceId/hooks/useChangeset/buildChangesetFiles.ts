import type { FileStatus } from "../../components/StatusIndicator";
import type { ChangesetFile, DiffRef } from "./types";

interface GitChangedFile {
	path: string;
	oldPath?: string;
	status: string;
	additions: number;
	deletions: number;
}

interface GitStatusChanges {
	againstBase: GitChangedFile[];
	staged: GitChangedFile[];
	unstaged: GitChangedFile[];
}

function toChangesetFile(
	file: GitChangedFile,
	source: ChangesetFile["source"],
): ChangesetFile {
	return {
		path: file.path,
		oldPath: file.oldPath,
		status: file.status as FileStatus,
		additions: file.additions,
		deletions: file.deletions,
		source,
	};
}

export function buildChangesetFiles(
	status: GitStatusChanges,
	ref: DiffRef,
): ChangesetFile[] {
	if (ref.kind === "uncommitted") {
		return [
			...status.unstaged.map((file) =>
				toChangesetFile(file, { kind: "unstaged" }),
			),
			...status.staged.map((file) => toChangesetFile(file, { kind: "staged" })),
		];
	}

	if (ref.kind !== "against-base") {
		return [];
	}

	return [
		...status.unstaged.map((file) =>
			toChangesetFile(file, { kind: "unstaged" }),
		),
		...status.staged.map((file) => toChangesetFile(file, { kind: "staged" })),
		...status.againstBase.map((file) =>
			toChangesetFile(file, {
				kind: "against-base",
				baseBranch: ref.baseBranch,
			}),
		),
	];
}
