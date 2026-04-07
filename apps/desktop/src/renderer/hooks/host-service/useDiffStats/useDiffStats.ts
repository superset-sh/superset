import { useCallback, useEffect, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

export interface DiffStats {
	additions: number;
	deletions: number;
}

/**
 * Fetches diff stats for a single workspace, auto-updates on git changes.
 * Just pass the workspaceId — host resolution is handled internally.
 */
export function useDiffStats(workspaceId: string): DiffStats | null {
	const [stats, setStats] = useState<DiffStats | null>(null);
	const hostUrl = useWorkspaceHostUrl(workspaceId);

	const fetchStats = useCallback(async () => {
		if (!hostUrl) return;
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			const status = await client.git.getStatus.query({ workspaceId });

			let additions = 0;
			let deletions = 0;
			for (const file of status.againstBase) {
				additions += file.additions;
				deletions += file.deletions;
			}
			for (const file of status.staged) {
				additions += file.additions;
				deletions += file.deletions;
			}
			for (const file of status.unstaged) {
				additions += file.additions;
				deletions += file.deletions;
			}

			setStats({ additions, deletions });
		} catch {
			// Host unavailable or workspace deleted
		}
	}, [hostUrl, workspaceId]);

	useEffect(() => {
		void fetchStats();
	}, [fetchStats]);

	useWorkspaceEvent("git:changed", workspaceId, () => {
		void fetchStats();
	});

	return stats;
}
