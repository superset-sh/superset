import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import {
	type PullRequest as FlowPullRequest,
	getPRFlowState,
	type PRFlowState,
} from "../../components/PRActionHeader/utils/getPRFlowState";

interface UsePRFlowStateResult {
	flowState: PRFlowState;
	onRetry: () => void;
}

export function usePRFlowState(workspaceId: string): UsePRFlowStateResult {
	const prQuery = workspaceTrpc.git.getPullRequest.useQuery(
		{ workspaceId },
		{
			enabled: !!workspaceId,
			refetchInterval: 10_000,
			refetchOnWindowFocus: true,
			staleTime: 10_000,
		},
	);

	const syncQuery = workspaceTrpc.git.getBranchSyncStatus.useQuery(
		{ workspaceId },
		{
			enabled: !!workspaceId,
			refetchInterval: 10_000,
			refetchOnWindowFocus: true,
			staleTime: 5_000,
		},
	);

	const flowState = useMemo(
		() =>
			getPRFlowState({
				pr: (prQuery.data as FlowPullRequest | null) ?? null,
				sync: syncQuery.data ?? null,
				isLoading: prQuery.isLoading || syncQuery.isLoading,
				isAgentRunning: false,
				loadError:
					(prQuery.error as Error | null) ??
					(syncQuery.error as Error | null) ??
					null,
			}),
		[
			prQuery.data,
			prQuery.error,
			prQuery.isLoading,
			syncQuery.data,
			syncQuery.error,
			syncQuery.isLoading,
		],
	);

	return {
		flowState,
		onRetry: () => {
			void prQuery.refetch();
			void syncQuery.refetch();
		},
	};
}
