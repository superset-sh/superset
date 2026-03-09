import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateWorkspaceQueries } from "./invalidateWorkspaceQueries";

export function useReorderProjectChildren(
	options?: Parameters<
		typeof electronTrpc.workspaces.reorderProjectChildren.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.reorderProjectChildren.useMutation({
		...options,
		onSuccess: async (...args) => {
			await invalidateWorkspaceQueries(utils);
			await options?.onSuccess?.(...args);
		},
	});
}
