import { electronTrpc } from "renderer/lib/electron-trpc";

export function useImportAllWorktrees() {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.importAllWorktrees.useMutation({
		onSuccess: async () => {
			await utils.workspaces.invalidate();
			await utils.projects.getRecents.invalidate();
		},
	});
}
