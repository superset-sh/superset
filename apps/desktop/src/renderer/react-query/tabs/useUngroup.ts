import { trpc } from "renderer/lib/trpc";

export function useUngroup(
	options?: Parameters<typeof trpc.tabs.ungroup.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.ungroup.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.tabs.invalidate();
			await utils.workspaces.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
