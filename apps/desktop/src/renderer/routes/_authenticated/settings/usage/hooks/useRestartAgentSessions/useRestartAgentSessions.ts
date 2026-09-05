import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type RestartableUsageAgent = "claude" | "codex";

/**
 * The post-switch restart flow for sessions the account engine cannot move:
 * a config dir the user exported by hand (`managed: false`). Managed Claude
 * sessions pick up the swapped login without relaunching, and managed Codex
 * sessions are restarted by the engine when they go idle, so
 * `countRestartCandidates` sizes the ask by the unmanaged rows only. The
 * mutation kills each one crash-style so the standard auto-resume relaunches
 * it with its own session id — same conversation, new active account.
 */
export function useRestartAgentSessions(hostUrl: string | null) {
	const countRestartCandidates = useCallback(
		async (agent: RestartableUsageAgent): Promise<number> => {
			if (!hostUrl) return 0;
			const candidates = await getHostServiceClientByUrl(
				hostUrl,
			).terminalAgents.accountRestartCandidates.query({ provider: agent });
			return candidates.filter((candidate) => candidate.managed === false)
				.length;
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
