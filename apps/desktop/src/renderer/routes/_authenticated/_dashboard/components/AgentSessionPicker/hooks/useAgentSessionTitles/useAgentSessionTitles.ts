import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function useAgentSessionTitles({
	workspaceId,
	enabled,
	open,
}: {
	workspaceId: string | null;
	enabled: boolean;
	open: boolean;
}) {
	const hostUrl = useWorkspaceHostUrl(workspaceId ?? "");
	const query = useQuery({
		queryKey: ["agent-session-titles", workspaceId, hostUrl],
		enabled: enabled && Boolean(workspaceId && hostUrl),
		staleTime: 5_000,
		refetchInterval: open ? 2_000 : false,
		refetchOnWindowFocus: false,
		queryFn: async ({ signal }) => {
			if (!hostUrl || !workspaceId) return [];
			const result = await getHostServiceClientByUrl(
				hostUrl,
			).terminal.list.query({ workspaceId }, { signal });
			return result.sessions;
		},
	});
	const titles = useMemo(
		() =>
			new Map(
				query.data?.map((session) => [session.terminalId, session.title]),
			),
		[query.data],
	);
	return { titles, refreshTitles: query.refetch };
}
