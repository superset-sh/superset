import { trpc } from "renderer/lib/trpc";

export function useSplit(
	options?: Parameters<typeof trpc.tabs.split.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.split.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.tabs.invalidate();
			await utils.workspaces.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
