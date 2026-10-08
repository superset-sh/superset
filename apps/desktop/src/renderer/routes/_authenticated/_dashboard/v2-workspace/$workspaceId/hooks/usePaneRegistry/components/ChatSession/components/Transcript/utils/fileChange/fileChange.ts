import type { ToolCall, ToolContent, ToolKind } from "@superset/chat/protocol";

export type FileChangeKind = "added" | "deleted" | "modified";

export type FileChange = {
	kind: FileChangeKind;
	/** The path as the agent reported it. */
	path: string;
	/** The last path segment, which is what a row has room for. */
	name: string;
};

type DiffToolContent = Extract<ToolContent, { type: "diff" }>;

/**
 * Empty new text is what the file holds now, not proof it is gone: an edit
 * can leave a file empty. Only the call's own kind says it was deleted.
 */
export function fileChangeKind(
	content: DiffToolContent,
	toolKind: ToolKind,
): FileChangeKind {
	if (toolKind === "delete") return "deleted";
	if (content.oldText === null) return "added";
	return "modified";
}

export function fileName(path: string): string {
	const trimmed = path.replace(/[\\/]+$/, "");
	const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	return index === -1 ? trimmed : trimmed.slice(index + 1);
}

/** Every path a call's diffs touch, once each; empty for a call without diffs. */
export function changedPaths(item: ToolCall): string[] {
	return [
		...new Set(
			item.content.flatMap((content) =>
				content.type === "diff" ? [content.path] : [],
			),
		),
	];
}

/**
 * The file a call changed, when it changed exactly one; null for every other
 * call. A move names two paths and a patch may touch several files, and the
 * agent's own title says that better than one name would.
 */
export function fileChangeOf(item: ToolCall): FileChange | null {
	if (item.toolKind === "move") return null;
	if (changedPaths(item).length !== 1) return null;
	const diff = item.content.find(
		(content): content is DiffToolContent => content.type === "diff",
	);
	if (!diff) return null;
	return {
		kind: fileChangeKind(diff, item.toolKind),
		path: diff.path,
		name: fileName(diff.path),
	};
}
