import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";

const DEFAULT_DEBOUNCE_MS = 75;

interface UseWorkspaceGitChangesRefreshOptions {
	workspaceId?: string;
	worktreePath?: string;
	defaultBranch?: string;
	enabled?: boolean;
	debounceMs?: number;
}

export function useWorkspaceGitChangesRefresh({
	workspaceId,
	worktreePath,
	defaultBranch,
	enabled = true,
	debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseWorkspaceGitChangesRefreshOptions): void {
	const trpcUtils = electronTrpc.useUtils();
	const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const previousConfigKeyRef = useRef<string | null>(null);
	const isEnabled =
		enabled && Boolean(workspaceId && worktreePath && defaultBranch);
	const refreshConfigKey = [
		workspaceId ?? "",
		worktreePath ?? "",
		defaultBranch ?? "",
		enabled ? "enabled" : "disabled",
		String(debounceMs),
	].join("::");

	const scheduleRefresh = () => {
		if (!worktreePath || !defaultBranch) {
			return;
		}

		if (refreshTimerRef.current) {
			clearTimeout(refreshTimerRef.current);
		}

		refreshTimerRef.current = setTimeout(() => {
			refreshTimerRef.current = null;
			Promise.all([
				trpcUtils.changes.getStatus.invalidate({
					worktreePath,
					defaultBranch,
				}),
				trpcUtils.changes.getBranches.invalidate({ worktreePath }),
			]).catch((error) => {
				console.error(
					"[useWorkspaceGitChangesRefresh] Failed to refresh git changes:",
					{
						workspaceId,
						worktreePath,
						error,
					},
				);
			});
		}, debounceMs);
	};

	useEffect(() => {
		if (!isEnabled && refreshTimerRef.current) {
			clearTimeout(refreshTimerRef.current);
			refreshTimerRef.current = null;
		}
	}, [isEnabled]);

	useEffect(() => {
		if (
			previousConfigKeyRef.current &&
			previousConfigKeyRef.current !== refreshConfigKey &&
			refreshTimerRef.current
		) {
			clearTimeout(refreshTimerRef.current);
			refreshTimerRef.current = null;
		}

		previousConfigKeyRef.current = refreshConfigKey;
	}, [refreshConfigKey]);

	useEffect(() => {
		return () => {
			if (refreshTimerRef.current) {
				clearTimeout(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
		};
	}, []);

	useWorkspaceFileEvents(
		workspaceId ?? "",
		() => {
			scheduleRefresh();
		},
		isEnabled,
	);

	electronTrpc.changes.subscribeGitMetadata.useSubscription(
		{ worktreePath: worktreePath ?? "" },
		{
			enabled: isEnabled,
			onData: () => {
				scheduleRefresh();
			},
			onError: (error) => {
				console.error(
					"[useWorkspaceGitChangesRefresh] Git metadata subscription failed:",
					{
						workspaceId,
						worktreePath,
						error,
					},
				);
			},
		},
	);
}
