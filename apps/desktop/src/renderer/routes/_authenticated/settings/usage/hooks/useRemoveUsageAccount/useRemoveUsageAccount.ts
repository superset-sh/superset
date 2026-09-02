import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { HOST_USAGE_QUOTA_QUERY_KEY } from "../useHostUsageQuota";

/**
 * Deletes a secondary agent profile (dir + scoped keychain items on the
 * host). The system default is never removable — the host rejects it.
 */
export function useRemoveUsageAccount(hostUrl: string | null) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			agent: "claude" | "codex";
			selection: string;
		}) => {
			if (!hostUrl) throw new Error("No host connection.");
			return getHostServiceClientByUrl(hostUrl).usage.removeAccount.mutate(
				input,
			);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: [...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl],
			});
		},
	});
}
