import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DEFAULT_SHOW_PRESETS_BAR } from "shared/constants";

export function useShowPresetsBar() {
	const utils = electronTrpc.useUtils();
	const { data: showPresetsBar } =
		electronTrpc.settings.getShowPresetsBar.useQuery();
	const setShowPresetsBar = electronTrpc.settings.setShowPresetsBar.useMutation(
		{
			onMutate: async ({ enabled }) => {
				await utils.settings.getShowPresetsBar.cancel();
				const previous = utils.settings.getShowPresetsBar.getData();
				utils.settings.getShowPresetsBar.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getShowPresetsBar.setData(undefined, context.previous);
				}
			},
			onSettled: () => {
				utils.settings.getShowPresetsBar.invalidate();
			},
		},
	);

	const { mutate: mutateShowPresetsBar } = setShowPresetsBar;
	const toggleShowPresetsBar = useCallback(() => {
		const current =
			utils.settings.getShowPresetsBar.getData() ?? DEFAULT_SHOW_PRESETS_BAR;
		mutateShowPresetsBar({ enabled: !current });
	}, [utils, mutateShowPresetsBar]);

	return { showPresetsBar, setShowPresetsBar, toggleShowPresetsBar };
}
