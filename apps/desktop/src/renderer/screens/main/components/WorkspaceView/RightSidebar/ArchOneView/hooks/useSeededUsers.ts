import { electronTrpc } from "renderer/lib/electron-trpc";

export function useSeededUsers(worktreePath: string | undefined) {
	const { data, isLoading, refetch } =
		electronTrpc.archOne.getSeededUsers.useQuery(
			{ worktreePath: worktreePath ?? "" },
			{
				enabled: !!worktreePath,
				refetchInterval: 30_000,
				staleTime: 15_000,
			},
		);

	return { data, isLoading, refetch };
}
