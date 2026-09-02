import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type RestartableUsageAgent = "claude" | "codex";

/**
 * The account-switch restart flow. `countRestartCandidates` sizes the ask
 * (running agents keep the previous account because their PTY env froze at
 * spawn); the mutation kills each one crash-style so the standard
 * auto-resume relaunches it with its own session id — same conversation,
 * new default account.
 */
export function useRestartAgentSessions(hostUrl: string | null) {
	const countRestartCandidates = useCallback(
		async (agent: RestartableUsageAgent): Promise<number> => {
			if (!hostUrl) return 0;
			const candidates = await getHostServiceClientByUrl(
				hostUrl,
			).terminalAgents.accountRestartCandidates.query({ provider: agent });
			return candidates.length;
		},
		[hostUrl],
	);

	const restartMutation = useMutation({
		mutationFn: async (input: { agent: RestartableUsageAgent }) => {
			if (!hostUrl) throw new Error("No host connection.");
			return getHostServiceClientByUrl(
				hostUrl,
			).terminalAgents.restartAccountSessions.mutate({ provider: input.agent });
		},
	});

	return { countRestartCandidates, restartMutation };
}
