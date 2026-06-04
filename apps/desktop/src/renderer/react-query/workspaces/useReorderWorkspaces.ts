import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateWorkspaceQueries } from "./invalidateWorkspaceQueries";

export function useReorderWorkspaces(
	options?: Parameters<typeof electronTrpc.workspaces.reorder.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.reorder.useMutation({
		...options,
		onSuccess: async (...args) => {
			await invalidateWorkspaceQueries(utils);
			await options?.onSuccess?.(...args);
		},
	});
}
