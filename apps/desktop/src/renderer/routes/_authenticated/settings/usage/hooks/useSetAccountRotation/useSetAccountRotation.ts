import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { rotationKey } from "../../utils/rotationKey";
import type { UsageAccount } from "../useHostUsageQuota";
import { HOST_USAGE_QUOTA_QUERY_KEY } from "../useHostUsageQuota";

/** Pure: the account list with one account's rotation flag replaced. */
export function withRotation(
	accounts: UsageAccount[],
	key: string,
	inRotation: boolean,
): UsageAccount[] {
	return accounts.map((account) =>
		rotationKey(account) === key ? { ...account, inRotation } : account,
	);
}

/**
 * R16's per-account "in rotation" toggle. A switch that only lights up after
 * a host round-trip reads as broken, so the quota cache is updated on the
 * spot and rolled back when the host refuses.
 */
export function useSetAccountRotation(hostUrl: string | null) {
	const queryClient = useQueryClient();
	const quotaKey = [...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl] as const;
	return useMutation({
		mutationFn: (input: {
			accountKey: string;
			inRotation: boolean;
		}): Promise<{ rotation: Record<string, boolean> }> => {
			if (!hostUrl) throw new Error("No host connection.");
			return getHostServiceClientByUrl(hostUrl).usage.engine.setRotation.mutate(
				input,
			);
		},
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: quotaKey });
			const previous = queryClient.getQueryData<UsageAccount[]>(quotaKey);
			if (previous) {
				queryClient.setQueryData(
					quotaKey,
					withRotation(previous, input.accountKey, input.inRotation),
				);
			}
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (context?.previous) {
				queryClient.setQueryData(quotaKey, context.previous);
			}
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: quotaKey });
		},
	});
}
