import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function useBranchSyncInvalidation({
	gitBranch,
	workspaceBranch,
	workspaceId,
}: {
	gitBranch: string | undefined;
	workspaceBranch: string | undefined;
	workspaceId: string;
}) {
	const utils = electronTrpc.useUtils();
	const { mutate } = electronTrpc.workspaces.syncBranch.useMutation();
	const syncingRef = useRef<string | null>(null);

	const doSync = useCallback(
		(branch: string) => {
			mutate(
				{ workspaceId, branch },
				{
					onSuccess: (result) => {
						if (!result.success || !("changed" in result) || !result.changed) {
							syncingRef.current = null;
							return;
						}

						utils.workspaces.getAllGrouped.setData(undefined, (oldData) => {
							if (!oldData) return oldData;
							return oldData.map((group) => ({
								...group,
								workspaces: group.workspaces.map((ws) =>
									ws.id === workspaceId ? { ...ws, branch } : ws,
								),
								sections: group.sections.map((section) => ({
									...section,
									workspaces: section.workspaces.map((ws) =>
										ws.id === workspaceId ? { ...ws, branch } : ws,
									),
								})),
							}));
						});

						utils.workspaces.get.invalidate({ id: workspaceId });
						utils.workspaces.getWorktreeInfo.invalidate({
							workspaceId,
						});
					},
					onError: () => {
						syncingRef.current = null;
					},
				},
			);
		},
		// utils is excluded — tRPC's useUtils() proxy produces new references
		// on every render, which would make doSync a new function every render,
		// causing the useEffect below to fire a syncBranch IPC mutation on every
		// render when gitBranch !== workspaceBranch. utils is backed by a stable
		// QueryClient and is safe to access via closure without listing as a dep.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[mutate, workspaceId],
	);

	useEffect(() => {
		if (!gitBranch || gitBranch === "HEAD" || !workspaceBranch) return;
		if (gitBranch === workspaceBranch) {
			syncingRef.current = null;
			return;
		}
		if (syncingRef.current === gitBranch) return;
		syncingRef.current = gitBranch;

		doSync(gitBranch);
	}, [gitBranch, workspaceBranch, doSync]);
}
