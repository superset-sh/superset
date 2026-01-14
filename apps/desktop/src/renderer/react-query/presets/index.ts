import { electronTrpc } from "renderer/lib/electron-trpc";

function useCreateTerminalPreset(
	options?: Parameters<
		typeof electronTrpc.settings.createTerminalPreset.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.settings.createTerminalPreset.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.settings.getTerminalPresets.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}

function useUpdateTerminalPreset(
	options?: Parameters<
		typeof electronTrpc.settings.updateTerminalPreset.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.settings.updateTerminalPreset.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.settings.getTerminalPresets.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}

function useDeleteTerminalPreset(
	options?: Parameters<
		typeof electronTrpc.settings.deleteTerminalPreset.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.settings.deleteTerminalPreset.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.settings.getTerminalPresets.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}

function useSetDefaultPreset(
	options?: Parameters<
		typeof electronTrpc.settings.setDefaultPreset.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.settings.setDefaultPreset.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.settings.getTerminalPresets.invalidate();
			await utils.settings.getDefaultPreset.invalidate();
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
		electronTrpc.settings.getTerminalPresets.useQuery();

	const { data: defaultPreset } =
		electronTrpc.settings.getDefaultPreset.useQuery();

	const createPreset = useCreateTerminalPreset();
	const updatePreset = useUpdateTerminalPreset();
	const deletePreset = useDeleteTerminalPreset();
	const setDefaultPreset = useSetDefaultPreset();

	return {
		presets,
		defaultPreset,
		isLoading,
		createPreset,
		updatePreset,
		deletePreset,
		setDefaultPreset,
	};
}
