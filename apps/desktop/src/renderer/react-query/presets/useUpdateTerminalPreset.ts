import { trpc } from "renderer/lib/trpc";

export function useUpdateTerminalPreset(
	options?: Parameters<
		typeof trpc.settings.updateTerminalPreset.useMutation
	>[0],
) {
	const utils = trpc.useUtils();

	return trpc.settings.updateTerminalPreset.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.settings.getTerminalPresets.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
