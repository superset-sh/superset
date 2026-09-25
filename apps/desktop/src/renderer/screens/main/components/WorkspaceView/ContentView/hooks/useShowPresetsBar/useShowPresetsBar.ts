import { useCallback, useRef } from "react";
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

	const { mutateAsync: mutateShowPresetsBar } = setShowPresetsBar;
	const toggleChainRef = useRef<Promise<void>>(Promise.resolve());
	const toggleShowPresetsBar = useCallback(() => {
		// Serialize toggles: each queued call reads the cache only after the
		// previous mutation's optimistic write has landed, so rapid events
		// invert cumulatively instead of collapsing into one. On a cold cache,
		// fetch the persisted value instead of assuming the default — otherwise
		// the first toggle after mount could re-write the persisted state.
		toggleChainRef.current = toggleChainRef.current.then(async () => {
			try {
				const current =
					utils.settings.getShowPresetsBar.getData() ??
					(await utils.settings.getShowPresetsBar.fetch());
				await mutateShowPresetsBar({ enabled: !current });
			} catch (error) {
				console.error(
					"[useShowPresetsBar] Failed to toggle presets bar",
					error,
				);
			}
		});
	}, [utils, mutateShowPresetsBar]);

	return { showPresetsBar, setShowPresetsBar, toggleShowPresetsBar };
}
