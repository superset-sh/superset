import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Live-reloads workspace card configs: subscribes to main-process file
 * watching of the project's .superset/config.json and invalidates the
 * config queries when it changes. Mount once per project (the sidebar
 * project sections do), not per workspace row.
 */
export function useWorkspaceCardConfigSync(projectId: string): void {
	const utils = electronTrpc.useUtils();
	electronTrpc.config.watchWorkspaceCardConfig.useSubscription(
		{ projectId },
		{
			onData: () => {
				void utils.config.getWorkspaceCardConfig.invalidate({ projectId });
				void utils.config.getWorkspaceCardConfigSource.invalidate({
					projectId,
				});
			},
		},
	);
}
