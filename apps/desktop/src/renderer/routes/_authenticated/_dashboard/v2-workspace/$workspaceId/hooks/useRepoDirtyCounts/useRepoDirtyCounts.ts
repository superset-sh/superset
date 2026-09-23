import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { changesPillStats } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/ChangesControl/changesPillStats";
import type { WorkspaceRepo } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useWorkspaceRepos";

const DIRTY_COUNT_STALE_TIME_MS = 30_000;

const NO_REPOS: WorkspaceRepo[] = [];

interface UseRepoDirtyCountsParams {
	workspaceId: string;
	repos: WorkspaceRepo[];
	enabled: boolean;
}

/** Changed-file count per folder; a folder whose status is still in flight
 * has no entry. */
export function useRepoDirtyCounts({
	workspaceId,
	repos,
	enabled,
}: UseRepoDirtyCountsParams): Record<string, number> {
	const targets = enabled ? repos : NO_REPOS;
	const statusQueries = workspaceTrpc.useQueries((t) =>
		targets.map((repo) =>
			t.git.getStatus(
				{ workspaceId, repo: repo.folder, priority: "background" },
				{ staleTime: DIRTY_COUNT_STALE_TIME_MS },
			),
		),
	);

	return useMemo(() => {
		const counts: Record<string, number> = {};
		targets.forEach((repo, index) => {
			const data = statusQueries[index]?.data;
			if (data) counts[repo.folder] = changesPillStats(data).fileCount;
		});
		return counts;
	}, [targets, statusQueries]);
}
