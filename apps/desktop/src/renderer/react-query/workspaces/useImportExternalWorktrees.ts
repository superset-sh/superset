import { electronTrpc } from "renderer/lib/electron-trpc";

export function useImportExternalWorktrees() {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.importExternalWorktrees.useMutation({
		onSuccess: async () => {
			await utils.workspaces.invalidate();
			await utils.projects.getRecents.invalidate();
		},
	});
}
