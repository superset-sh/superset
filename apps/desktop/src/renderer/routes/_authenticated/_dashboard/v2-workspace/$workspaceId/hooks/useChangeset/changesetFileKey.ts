import type { ChangesetFile } from "./types";

export function getChangesetFileKey(file: ChangesetFile): string {
	const { source } = file;
	if (source.kind === "against-base") {
		return `against-base:${source.baseBranch ?? ""}:${file.path}`;
	}
	if (source.kind === "commit") {
		return `commit:${source.fromHash ?? ""}:${source.commitHash}:${file.path}`;
	}
	return `${source.kind}:${file.path}`;
}
