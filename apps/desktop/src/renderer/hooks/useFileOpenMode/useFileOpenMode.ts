import { electronTrpc } from "renderer/lib/electron-trpc";

export function useFileOpenMode() {
	const { data } = electronTrpc.settings.getFileOpenMode.useQuery();
	return data ?? "split-pane";
}
