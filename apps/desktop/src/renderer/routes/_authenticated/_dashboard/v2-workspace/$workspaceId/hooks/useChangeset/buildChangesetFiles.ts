import type { FileStatus } from "../../components/StatusIndicator";
import type { ChangesetFile, DiffRef } from "./types";

interface GitChangedFile {
	path: string;
	oldPath?: string;
	status: string;
	additions: number;
	deletions: number;
	isBinary?: boolean;
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
		isBinary: file.isBinary,
		source,
	};
}

/** Refs whose files come from the working tree. Commit refs are resolved from a
 *  separate query in `useChangeset`, so they never reach this builder. */
type WorkingTreeRef = Exclude<DiffRef, { kind: "commit" }>;

export function buildChangesetFiles(
	status: GitStatusChanges,
	ref: WorkingTreeRef,
): ChangesetFile[] {
	const dirty = [
		...status.unstaged.map((file) =>
			toChangesetFile(file, { kind: "unstaged" }),
		),
		...status.staged.map((file) => toChangesetFile(file, { kind: "staged" })),
	];

	switch (ref.kind) {
		case "uncommitted":
			return dirty;
		case "against-base":
			return [
				...dirty,
				...status.againstBase.map((file) =>
					toChangesetFile(file, {
						kind: "against-base",
						baseBranch: ref.baseBranch,
					}),
				),
			];
		default: {
			// Compile-time exhaustiveness: a new working-tree ref kind must be
			// handled here rather than silently yielding an empty list.
			const exhaustive: never = ref;
			return exhaustive;
		}
	}
}
