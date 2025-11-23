import { trpc } from "renderer/lib/trpc";

export function useSetParent(
	options?: Parameters<typeof trpc.tabs.setParent.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.setParent.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.tabs.invalidate();
			await utils.workspaces.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
