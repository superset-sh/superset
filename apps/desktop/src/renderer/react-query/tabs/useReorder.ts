import { trpc } from "renderer/lib/trpc";

export function useReorder(
	options?: Parameters<typeof trpc.tabs.reorder.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.reorder.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.tabs.invalidate();
			await utils.workspaces.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
