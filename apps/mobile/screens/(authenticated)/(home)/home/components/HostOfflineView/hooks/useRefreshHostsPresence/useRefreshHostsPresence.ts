import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export function useRefreshHostsPresence(): () => Promise<void> {
	const queryClient = useQueryClient();
	return useCallback(
		// Without this an invalidation cancels the fetch already in flight, so
		// polling a relay slower than the poll interval never gets an answer.
		() =>
			queryClient.invalidateQueries(
				{ queryKey: ["hosts-presence"] },
				{ cancelRefetch: false },
			),
		[queryClient],
	);
}
