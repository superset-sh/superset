import { trpc } from "renderer/lib/trpc";

export function useCreateTerminalPreset(
	options?: Parameters<
		typeof trpc.settings.createTerminalPreset.useMutation
	>[0],
) {
	const utils = trpc.useUtils();

	return trpc.settings.createTerminalPreset.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.settings.getTerminalPresets.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
