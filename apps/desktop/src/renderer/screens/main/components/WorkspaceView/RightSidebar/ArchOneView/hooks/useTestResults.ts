import { electronTrpc } from "renderer/lib/electron-trpc";

export function useTestResults(worktreePath: string | undefined) {
	const { data, isLoading, refetch } =
		electronTrpc.archOne.getTestResults.useQuery(
			{ worktreePath: worktreePath ?? "" },
			{
				enabled: !!worktreePath,
				refetchInterval: 30_000,
			},
		);

	return { data, isLoading, refetch };
}
