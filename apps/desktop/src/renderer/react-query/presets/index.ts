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

function useSetPresetAutoApply(
	options?: Parameters<
		typeof electronTrpc.settings.setPresetAutoApply.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.settings.setPresetAutoApply.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.settings.getTerminalPresets.invalidate();
			await utils.settings.getWorkspaceCreationPresets.invalidate();
			await utils.settings.getNewTabPresets.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}

function useReorderTerminalPresets(
	options?: Parameters<
		typeof electronTrpc.settings.reorderTerminalPresets.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.settings.reorderTerminalPresets.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.settings.getTerminalPresets.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}

export function usePresets() {
	const { data: presets = [], isLoading } =
		electronTrpc.settings.getTerminalPresets.useQuery();

	const createPreset = useCreateTerminalPreset();
	const updatePreset = useUpdateTerminalPreset();
	const deletePreset = useDeleteTerminalPreset();
	const setPresetAutoApply = useSetPresetAutoApply();
	const reorderPresets = useReorderTerminalPresets();

	return {
		presets,
		isLoading,
		createPreset,
		updatePreset,
		deletePreset,
		setPresetAutoApply,
		reorderPresets,
	};
}
