import { electronTrpc } from "renderer/lib/electron-trpc";

export function useCreateRemoteWorkspace() {
	return electronTrpc.workspaces.createRemote.useMutation();
}
