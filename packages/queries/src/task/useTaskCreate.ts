"use client";

import type { AppRouter } from "@superset/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

type TRPCClient = TRPCOptionsProxy<AppRouter>;

export function useTaskCreate(trpc: TRPCClient) {
	const queryClient = useQueryClient();

	return useMutation(
		trpc.task.create.mutationOptions({
			onSuccess: (data, variables) => {
				void queryClient.invalidateQueries({
					queryKey: trpc.task.byRepository.queryKey(variables.repositoryId),
				});
				if (data) {
					queryClient.setQueryData(trpc.task.byId.queryKey(data.id), data);
				}
			},
		}),
	);
}
