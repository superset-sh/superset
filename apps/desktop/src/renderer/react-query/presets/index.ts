import { trpc } from "renderer/lib/trpc";

function useCreateTerminalPreset(
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

function useUpdateTerminalPreset(
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

function useDeleteTerminalPreset(
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

/**
 * Combined hook for accessing terminal presets with all CRUD operations
 * Provides easy access to presets data and mutations from anywhere in the app
 */
export function usePresets() {
	const { data: presets = [], isLoading } =
		trpc.settings.getTerminalPresets.useQuery();

	const createPreset = useCreateTerminalPreset();
	const updatePreset = useUpdateTerminalPreset();
	const deletePreset = useDeleteTerminalPreset();

	return {
		presets,
		isLoading,
		createPreset,
		updatePreset,
		deletePreset,
	};
}
