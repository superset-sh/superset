import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { ChangedFile, CommitInfo } from "shared/changes-types";

/**
 * Fetches file lists for expanded commits via batched queries.
 * Shared between the "Commits" section and the "History" section.
 */
export function useCommitFiles(
	worktreePath: string,
	expandedHashes: string[],
): Map<string, ChangedFile[]> {
	const queries = electronTrpc.useQueries((t) =>
		expandedHashes.map((hash) =>
			t.changes.getCommitFiles({
				worktreePath: worktreePath || "",
				commitHash: hash,
			}),
		),
	);

	return useMemo(() => {
		const map = new Map<string, ChangedFile[]>();
		expandedHashes.forEach((hash, index) => {
			const query = queries[index];
			if (query?.data) {
				map.set(hash, query.data);
			}
		});
		return map;
	}, [expandedHashes, queries]);
}

export function applyCommitFiles(
	commits: CommitInfo[],
	filesMap: Map<string, ChangedFile[]>,
): CommitInfo[] {
	return commits.map((commit) => ({
		...commit,
		files: filesMap.get(commit.hash) || commit.files,
	}));
}
