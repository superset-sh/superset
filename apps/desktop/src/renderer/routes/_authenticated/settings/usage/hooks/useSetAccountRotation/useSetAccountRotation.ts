import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { rotationKey } from "../../utils/rotationKey";
import type { UsageAccount } from "../useHostUsageQuota";
import { HOST_USAGE_QUOTA_QUERY_KEY } from "../useHostUsageQuota";

const SET_ACCOUNT_ROTATION_MUTATION_KEY = ["set-account-rotation"] as const;

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
	const mutationKey = [...SET_ACCOUNT_ROTATION_MUTATION_KEY, hostUrl] as const;
	return useMutation({
		mutationKey,
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
		onError: (_error, input, context) => {
			// Put back only this account's flag, on top of whatever the cache holds
			// now: toggles run in parallel, so restoring the whole snapshot would
			// revert an account the user flipped while this call was in flight.
			const restored = context?.previous?.find(
				(account) => rotationKey(account) === input.accountKey,
			)?.inRotation;
			const current = queryClient.getQueryData<UsageAccount[]>(quotaKey);
			if (current && restored !== undefined) {
				queryClient.setQueryData(
					quotaKey,
					withRotation(current, input.accountKey, restored),
				);
			}
		},
		onSettled: () => {
			// Every toggle reads the same quota query, and the host only holds a
			// flag once its own call has landed. Refetching while another toggle is
			// still in flight would answer with that account's old flag and flip the
			// switch the user just moved back on until its call returns, so only the
			// last toggle to settle — this one, when it is the only one left
			// pending — refetches.
			if (queryClient.isMutating({ mutationKey }) > 1) return;
			void queryClient.invalidateQueries({ queryKey: quotaKey });
		},
	});
}
