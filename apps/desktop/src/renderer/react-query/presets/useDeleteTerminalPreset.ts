import { trpc } from "renderer/lib/trpc";

export function useDeleteTerminalPreset(
	options?: Parameters<
		typeof trpc.settings.deleteTerminalPreset.useMutation
	>[0],
) {
	const utils = trpc.useUtils();

	return trpc.settings.deleteTerminalPreset.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.settings.getTerminalPresets.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
