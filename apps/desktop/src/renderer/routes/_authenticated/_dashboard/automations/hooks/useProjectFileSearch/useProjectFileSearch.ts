import { useCallback } from "react";
import type { FileMentionSearchFn } from "renderer/components/MarkdownEditor/components/FileMention";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

const SEARCH_LIMIT = 15;

export function useProjectFileSearch({
	hostId,
	projectId,
}: {
	hostId: string | null;
	projectId: string | null;
}): FileMentionSearchFn | undefined {
	const hostUrl = useHostUrl(hostId);

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
