import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type {
	AccountEngineAgentSettings,
	AccountEngineSnapshot,
	EngineAgent,
} from "../useAccountEngineSettings";
import { ACCOUNT_ENGINE_QUERY_KEY } from "../useAccountEngineSettings";

/**
 * Writes one agent's auto-switch settings (R10 to R16). The host answers with
 * the whole snapshot, so the confirmed state is seeded from the response
 * rather than refetched — a rejection leaves the cache on the last confirmed
 * values, which is what the controls revert to.
 */
export function useSetAccountEngineSettings(hostUrl: string | null) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			agent: EngineAgent;
			patch: Partial<AccountEngineAgentSettings>;
		}): Promise<AccountEngineSnapshot> => {
			if (!hostUrl) throw new Error("No host connection.");
			return getHostServiceClientByUrl(hostUrl).usage.engine.setSettings.mutate(
				input,
			);
		},
		onSuccess: (snapshot) => {
			queryClient.setQueryData(
				[...ACCOUNT_ENGINE_QUERY_KEY, hostUrl],
				snapshot,
			);
		},
	});
}
