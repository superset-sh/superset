import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHandleOpenedWorktree } from "./useHandleOpenedWorktree";

export function useOpenTrackedWorktree() {
	const handleOpenedWorktree = useHandleOpenedWorktree();

	return electronTrpc.workspaces.openWorktree.useMutation({
		onSuccess: async (data) => {
			await handleOpenedWorktree(data);
		},
	});
}
