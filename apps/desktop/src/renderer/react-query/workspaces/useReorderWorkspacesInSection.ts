import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateWorkspaceQueries } from "./invalidateWorkspaceQueries";

export function useReorderWorkspacesInSection(
	options?: Parameters<
		typeof electronTrpc.workspaces.reorderWorkspacesInSection.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.reorderWorkspacesInSection.useMutation({
		...options,
		onSuccess: async (...args) => {
			await invalidateWorkspaceQueries(utils);
			await options?.onSuccess?.(...args);
		},
	});
}
