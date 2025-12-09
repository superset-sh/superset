import { trpc } from "renderer/lib/trpc";
import { useCreateTerminalPreset } from "./useCreateTerminalPreset";
import { useDeleteTerminalPreset } from "./useDeleteTerminalPreset";
import { useUpdateTerminalPreset } from "./useUpdateTerminalPreset";

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
