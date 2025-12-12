"use client";

import type { AppRouter } from "@superset/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

type TRPCClient = TRPCOptionsProxy<AppRouter>;

export function useTaskUpdate(trpc: TRPCClient) {
	const queryClient = useQueryClient();

	return useMutation(
		trpc.task.update.mutationOptions({
			onSuccess: (data) => {
				if (data) {
					queryClient.setQueryData(trpc.task.byId.queryKey(data.id), data);
					void queryClient.invalidateQueries({
						queryKey: trpc.task.all.queryKey(),
					});
				}
			},
		}),
	);
}
