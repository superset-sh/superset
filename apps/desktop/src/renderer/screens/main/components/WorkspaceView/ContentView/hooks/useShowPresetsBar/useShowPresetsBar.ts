import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

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
		// Read at call time (not from a render closure) so back-to-back toggles
		// see each other's optimistic writes. On a cold cache, fetch the
		// persisted value instead of assuming the default — otherwise the first
		// toggle after mount could re-write the already-persisted state.
		void (async () => {
			try {
				const current =
					utils.settings.getShowPresetsBar.getData() ??
					(await utils.settings.getShowPresetsBar.fetch());
				mutateShowPresetsBar({ enabled: !current });
			} catch (error) {
				console.error(
					"[useShowPresetsBar] Failed to resolve current setting for toggle",
					error,
				);
			}
		})();
	}, [utils, mutateShowPresetsBar]);

	return { showPresetsBar, setShowPresetsBar, toggleShowPresetsBar };
}
