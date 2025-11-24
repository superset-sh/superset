import { trpc } from "renderer/lib/trpc";

export function useMoveOutOfGroup(
	options?: Parameters<typeof trpc.tabs.moveOutOfGroup.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.moveOutOfGroup.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.tabs.invalidate();
			await utils.workspaces.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
