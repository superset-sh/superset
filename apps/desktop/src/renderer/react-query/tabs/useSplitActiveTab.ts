import { trpc } from "renderer/lib/trpc";

export function useSplitActiveTab(
	options?: Parameters<typeof trpc.tabs.splitActiveTab.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.splitActiveTab.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.tabs.invalidate();
			await utils.workspaces.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
