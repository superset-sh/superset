import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useTRPC } from "@/trpc/react";

export function useInvalidateHiring() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	return useCallback(
		() => queryClient.invalidateQueries({ queryKey: trpc.hiring.pathKey() }),
		[queryClient, trpc],
	);
}
