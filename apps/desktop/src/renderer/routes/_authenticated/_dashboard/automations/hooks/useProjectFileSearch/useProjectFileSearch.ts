import { useCallback } from "react";
import type { FileMentionSearchFn } from "renderer/components/MarkdownEditor/components/FileMention";
import { useHostTargetUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { WorkspaceHostTarget } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/types";

const SEARCH_LIMIT = 15;

export function useProjectFileSearch({
	hostTarget,
	projectId,
}: {
	hostTarget: WorkspaceHostTarget;
	projectId: string | null;
}): FileMentionSearchFn | undefined {
	const hostUrl = useHostTargetUrl(hostTarget);

	return useCallback<FileMentionSearchFn>(
		async (query) => {
			if (!projectId || !hostUrl) return [];
			const client = getHostServiceClientByUrl(hostUrl);
			const result = await client.filesystem.searchFiles.query({
				projectId,
				query,
				limit: SEARCH_LIMIT,
			});
			return result.matches.map((match) => ({
				id: match.absolutePath,
				name: match.name,
				relativePath: match.relativePath,
				isDirectory: match.kind === "directory",
			}));
		},
		[hostUrl, projectId],
	);
}
