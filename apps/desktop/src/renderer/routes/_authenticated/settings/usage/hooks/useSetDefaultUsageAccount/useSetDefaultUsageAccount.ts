import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { ACCOUNT_ENGINE_QUERY_KEY } from "../useAccountEngineSettings";
import { HOST_USAGE_QUOTA_QUERY_KEY } from "../useHostUsageQuota";
import { SWITCH_HISTORY_QUERY_KEY } from "../useSwitchHistory";

/**
 * Makes one of the discovered agent logins the active account (R2, R4): the
 * host performs the switch, so running sessions move too — it is no longer a
 * pointer for the next launch. The cooldown resets and auto-switch stays on.
 * A refusal arrives as PRECONDITION_FAILED carrying the engine's code, which
 * the card turns into a line the user can act on.
 */
export function useSetDefaultUsageAccount(hostUrl: string | null) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			agent: "claude" | "codex";
			selection: string | null;
		}) => {
			if (!hostUrl) throw new Error("No host connection.");
			return getHostServiceClientByUrl(hostUrl).usage.setDefaultAccount.mutate(
				input,
			);
		},
		onSuccess: () => {
			// The host recomputes `isDefault` per query, so a plain invalidate
			// reflects the switch without re-hitting agent quota endpoints; the
			// switch also lands in history and resets the engine's cooldown.
			void queryClient.invalidateQueries({
				queryKey: [...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl],
			});
			void queryClient.invalidateQueries({
				queryKey: [...SWITCH_HISTORY_QUERY_KEY, hostUrl],
			});
			void queryClient.invalidateQueries({
				queryKey: [...ACCOUNT_ENGINE_QUERY_KEY, hostUrl],
			});
		},
	});
}
