import { electronTrpc } from "renderer/lib/electron-trpc";

export function useGreptileScore(
	worktreePath: string | undefined,
	pollInterval = 60_000,
) {
	const { data, isLoading, error, refetch, dataUpdatedAt } =
		electronTrpc.archOne.getGreptileScore.useQuery(
			{ worktreePath: worktreePath ?? "" },
			{
				enabled: !!worktreePath,
				staleTime: Math.min(pollInterval, 60_000),
				refetchInterval: pollInterval,
			},
		);

	return { data, isLoading, error, refetch, dataUpdatedAt };
}

export function useFixStatus(worktreePath: string | undefined) {
	const { data, refetch } = electronTrpc.archOne.getFixStatus.useQuery(
		{ worktreePath: worktreePath ?? "" },
		{
			enabled: !!worktreePath,
			refetchInterval: 5_000,
		},
	);

	return { data, refetch };
}
