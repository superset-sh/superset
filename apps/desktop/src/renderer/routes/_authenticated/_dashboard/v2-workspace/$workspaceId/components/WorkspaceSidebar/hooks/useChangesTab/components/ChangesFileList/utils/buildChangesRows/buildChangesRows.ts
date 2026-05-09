import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";

export type GroupKey = "unstaged" | "staged" | "against-base" | "commit";

export const GROUP_ORDER: readonly GroupKey[] = [
	"unstaged",
	"staged",
	"against-base",
	"commit",
];

export const GROUP_TITLES: Record<GroupKey, string> = {
	unstaged: "Unstaged",
	staged: "Staged",
	"against-base": "Against base",
	commit: "Committed",
};

export type ChangesRow =
	| {
			kind: "header";
			key: GroupKey;
			groupKey: GroupKey;
			title: string;
			count: number;
			open: boolean;
	  }
	| {
			kind: "file";
			key: string;
			groupKey: GroupKey;
			file: ChangesetFile;
	  };

export function groupChangesetFiles(
	files: ChangesetFile[],
): Record<GroupKey, ChangesetFile[]> {
	const groups: Record<GroupKey, ChangesetFile[]> = {
		unstaged: [],
		staged: [],
		"against-base": [],
		commit: [],
	};
	for (const file of files) {
		groups[file.source.kind].push(file);
	}
	return groups;
}

export function buildChangesRows(
	groups: Record<GroupKey, ChangesetFile[]>,
	openGroups: Record<GroupKey, boolean>,
): ChangesRow[] {
	const rows: ChangesRow[] = [];
	for (const groupKey of GROUP_ORDER) {
		const files = groups[groupKey];
		if (files.length === 0) continue;
		const open = openGroups[groupKey];
		rows.push({
			kind: "header",
			key: groupKey,
			groupKey,
			title: GROUP_TITLES[groupKey],
			count: files.length,
			open,
		});
		if (!open) continue;
		for (const file of files) {
			rows.push({
				kind: "file",
				key: `${groupKey}:${file.path}`,
				groupKey,
				file,
			});
		}
	}
	return rows;
}
