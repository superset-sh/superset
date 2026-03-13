import { electronTrpc } from "renderer/lib/electron-trpc";

export function useEnvSync(worktreePath: string | undefined) {
	const { data, isLoading, refetch } =
		electronTrpc.archOne.getEnvSyncStatus.useQuery(
			{ worktreePath: worktreePath ?? "" },
			{
				enabled: !!worktreePath,
				refetchInterval: 30_000,
			},
		);

	return { data, isLoading, refetch };
}
