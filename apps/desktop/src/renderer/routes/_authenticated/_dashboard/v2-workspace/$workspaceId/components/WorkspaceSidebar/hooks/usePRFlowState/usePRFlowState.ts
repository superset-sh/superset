import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	type PullRequest as FlowPullRequest,
	getPRFlowState,
	type PRFlowState,
} from "../../components/PRActionHeader/utils/getPRFlowState";

interface UsePRFlowStateResult {
	flowState: PRFlowState;
	onRetry: () => void;
}

const PROVIDER_REFRESH_COOLDOWN_MS = 30_000;

interface ProviderRefreshState {
	lastRefreshAt: number;
	inFlight: boolean;
}

export function usePRFlowState(workspaceId: string): UsePRFlowStateResult {
	const utils = workspaceTrpc.useUtils();
	const providerRefreshState = useRef(new Map<string, ProviderRefreshState>());
	const { mutateAsync: refreshPullRequest } =
		workspaceTrpc.pullRequests.refreshByWorkspaces.useMutation();
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

	const refreshFromProvider = useCallback(
		async (force = false) => {
			if (!workspaceId) return;
			const state = providerRefreshState.current.get(workspaceId) ?? {
				lastRefreshAt: 0,
				inFlight: false,
			};
			providerRefreshState.current.set(workspaceId, state);
			if (state.inFlight) return;
			const now = Date.now();
			if (!force && now - state.lastRefreshAt < PROVIDER_REFRESH_COOLDOWN_MS) {
				return;
			}

			state.lastRefreshAt = now;
			state.inFlight = true;
			try {
				await refreshPullRequest({ workspaceIds: [workspaceId] });
			} catch (error) {
				console.warn("Failed to refresh pull request from provider", error);
			} finally {
				state.inFlight = false;
				await Promise.all([
					utils.git.getPullRequest.invalidate({ workspaceId }),
					utils.git.getBranchSyncStatus.invalidate({ workspaceId }),
				]);
			}
		},
		[refreshPullRequest, utils, workspaceId],
	);

	useEffect(() => {
		void refreshFromProvider();
		const handleFocus = () => void refreshFromProvider();
		window.addEventListener("focus", handleFocus);
		return () => window.removeEventListener("focus", handleFocus);
	}, [refreshFromProvider]);

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
			void refreshFromProvider(true);
		},
	};
}
