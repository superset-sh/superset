import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

type ResumeCandidateClient = ReturnType<
	typeof getHostServiceClientByUrl
>["terminalAgents"]["resumeCandidate"];
export type TerminalResumeCandidate = NonNullable<
	Awaited<ReturnType<ResumeCandidateClient["query"]>>
>;

export function getTerminalResumeCandidateQueryKey(
	workspaceId: string,
	terminalId: string,
) {
	return ["terminal-resume-candidate", workspaceId, terminalId] as const;
}

/**
 * The resumable agent session behind this pane's terminal: non-null when the
 * terminal died under the agent (kill, crash, daemon death, reboot) without
 * the agent's own SessionEnd. Null while the agent is alive or after a clean
 * exit.
 */
export function useTerminalResumeCandidate(
	workspaceId: string,
	terminalId: string,
): { candidate: TerminalResumeCandidate | null; invalidate: () => void } {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => getTerminalResumeCandidateQueryKey(workspaceId, terminalId),
		[workspaceId, terminalId],
	);

	const enabled =
		Boolean(workspaceId) && Boolean(terminalId) && Boolean(hostUrl);

	const { data } = useQuery({
		queryKey,
		enabled,
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(
				hostUrl,
			).terminalAgents.resumeCandidate.query({ workspaceId, terminalId });
		},
		staleTime: 15_000,
	});

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	useWorkspaceEvent("agent:lifecycle", workspaceId, invalidate, enabled);
	useWorkspaceEvent("terminal:lifecycle", workspaceId, invalidate, enabled);

	return { candidate: data ?? null, invalidate };
}
