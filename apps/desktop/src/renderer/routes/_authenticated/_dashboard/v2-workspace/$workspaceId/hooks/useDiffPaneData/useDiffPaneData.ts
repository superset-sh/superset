import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";

export type DiffCategory = "against-base" | "staged" | "unstaged";

export interface DiffPaneFile {
	path: string;
	oldPath?: string;
	additions: number;
	deletions: number;
	category: DiffCategory;
}

export function useDiffPaneData({
	workspaceId,
	enabled = true,
}: {
	workspaceId: string;
	enabled?: boolean;
}) {
	const status = workspaceTrpc.git.getStatus.useQuery(
		{ workspaceId },
		{ enabled, staleTime: 0 },
	);

	const files = useMemo<DiffPaneFile[]>(() => {
		const s = status.data;
		if (!s) return [];
		const mapped: DiffPaneFile[] = [];
		for (const f of s.unstaged)
			mapped.push({
				path: f.path,
				oldPath: f.oldPath,
				additions: f.additions,
				deletions: f.deletions,
				category: "unstaged",
			});
		for (const f of s.staged)
			mapped.push({
				path: f.path,
				oldPath: f.oldPath,
				additions: f.additions,
				deletions: f.deletions,
				category: "staged",
			});
		for (const f of s.againstBase)
			mapped.push({
				path: f.path,
				oldPath: f.oldPath,
				additions: f.additions,
				deletions: f.deletions,
				category: "against-base",
			});
		return mapped;
	}, [status.data]);

	return {
		files: {
			data: { files },
			isLoading: status.isLoading,
		},
		threads: { data: undefined },
	};
}
