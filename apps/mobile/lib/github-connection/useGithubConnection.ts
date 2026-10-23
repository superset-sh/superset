import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { apiClient } from "@/lib/trpc/client";

export const GITHUB_CONNECTION_QUERY_KEY = [
	"cloud",
	"githubUser",
	"get",
] as const;

/**
 * The person's own GitHub connection: what it is, and how to start or end
 * one. Authorizing happens on GitHub in an in-app browser; the API's callback
 * page tells them to come back, and closing it is when the answer is re-read.
 */
export function useGithubConnection() {
	const queryClient = useQueryClient();
	const status = useQuery({
		queryKey: GITHUB_CONNECTION_QUERY_KEY,
		queryFn: () => apiClient.githubUser.get.query(),
		staleTime: 60_000,
	});
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: GITHUB_CONNECTION_QUERY_KEY });

	const connect = useMutation({
		mutationFn: async () => {
			const { url } = await apiClient.githubUser.connect.mutate();
			await WebBrowser.openBrowserAsync(url);
		},
		onSettled: refresh,
	});
	const disconnect = useMutation({
		mutationFn: () => apiClient.githubUser.disconnect.mutate(),
		onSettled: refresh,
	});

	return {
		/** Null while unknown; the server says whether connecting is even offered. */
		available: status.data?.available ?? null,
		connection: status.data?.connection ?? null,
		isLoading: status.isPending,
		connect,
		disconnect,
	};
}
