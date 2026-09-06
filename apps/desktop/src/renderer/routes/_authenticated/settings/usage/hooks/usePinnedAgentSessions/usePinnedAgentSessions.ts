import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

/**
 * Sizes the post-switch notice on the Usage tab: how many live sessions the
 * switch could not reach because their agent config exports its own
 * `CLAUDE_CONFIG_DIR` / `CODEX_HOME` (`managed: false`). That env is baked
 * into the PTY at spawn and wins over the host default at launch, so those
 * sessions keep their own account whatever happens here — restarting them
 * would only bring them back on the same pinned account. Managed sessions
 * need no count at all: Claude picks the swapped login up in place and the
 * engine restarts Codex when it goes idle.
 */
export function usePinnedAgentSessions(hostUrl: string | null) {
	const countPinnedSessions = useCallback(
		async (agent: "claude" | "codex"): Promise<number> => {
			if (!hostUrl) return 0;
			const candidates = await getHostServiceClientByUrl(
				hostUrl,
			).terminalAgents.accountRestartCandidates.query({ provider: agent });
			return candidates.filter((candidate) => candidate.managed === false)
				.length;
		},
		[hostUrl],
	);

	return { countPinnedSessions };
}
