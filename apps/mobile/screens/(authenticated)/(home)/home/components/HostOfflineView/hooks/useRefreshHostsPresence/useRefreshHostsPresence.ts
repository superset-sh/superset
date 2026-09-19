import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export function useRefreshHostsPresence(): () => Promise<void> {
	const queryClient = useQueryClient();
	return useCallback(
		() => queryClient.invalidateQueries({ queryKey: ["hosts-presence"] }),
		[queryClient],
	);
}
