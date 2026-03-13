import { electronTrpc } from "renderer/lib/electron-trpc";

export function useServiceHealth(worktreePath: string | undefined) {
	const { data, isLoading } =
		electronTrpc.archOne.getServiceHealth.useQuery(
			{ worktreePath: worktreePath ?? "" },
			{
				enabled: !!worktreePath,
				refetchInterval: 30_000,
			},
		);

	return { data, isLoading };
}
