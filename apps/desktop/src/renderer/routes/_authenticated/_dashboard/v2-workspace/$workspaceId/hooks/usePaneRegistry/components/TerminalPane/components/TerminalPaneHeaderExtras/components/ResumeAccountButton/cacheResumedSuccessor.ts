import type { QueryClient, QueryKey } from "@tanstack/react-query";

export async function cacheResumedSuccessor(
	queryClient: QueryClient,
	queryKey: QueryKey,
	successor: { terminalId: string; label: string },
): Promise<void> {
	// A pre-resume lookup can still return null after the mutation succeeds.
	await queryClient.cancelQueries({ queryKey, exact: true });
	queryClient.setQueryData(queryKey, successor);
}
