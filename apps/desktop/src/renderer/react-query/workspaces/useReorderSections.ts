import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateWorkspaceQueries } from "./invalidateWorkspaceQueries";

export function useReorderSections(
	options?: Parameters<
		typeof electronTrpc.workspaces.reorderSections.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.reorderSections.useMutation({
		...options,
		onSuccess: async (...args) => {
			await invalidateWorkspaceQueries(utils);
			await options?.onSuccess?.(...args);
		},
	});
}
