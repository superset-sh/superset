import { electronTrpc } from "renderer/lib/electron-trpc";

export function useGitStatus(worktreePath: string | undefined) {
	const { data, isLoading, refetch } =
		electronTrpc.archOne.getGitStatus.useQuery(
			{ worktreePath: worktreePath ?? "" },
			{
				enabled: !!worktreePath,
				refetchInterval: 15_000,
			},
		);

	return { data, isLoading, refetch };
}
