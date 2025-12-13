"use client";

import type { AppRouter } from "@superset/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

type TRPCClient = TRPCOptionsProxy<AppRouter>;

export function useTaskDelete(trpc: TRPCClient) {
	const queryClient = useQueryClient();

	return useMutation(
		trpc.task.delete.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.task.all.queryKey(),
				});
			},
		}),
	);
}
