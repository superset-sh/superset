import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * The "Hide empty projects" sidebar setting. It lives in local.db, so
 * `superset settings set hideEmptySidebarProjects` changes it too; the
 * /settings-changed nudge refetches it while the app runs.
 */
export function useHideEmptySidebarProjects(): [
	boolean,
	(enabled: boolean) => void,
] {
	const utils = electronTrpc.useUtils();
	const { data: enabled = false } =
		electronTrpc.settings.getHideEmptySidebarProjects.useQuery();
	const { mutate } =
		electronTrpc.settings.setHideEmptySidebarProjects.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getHideEmptySidebarProjects.cancel();
				const previous = utils.settings.getHideEmptySidebarProjects.getData();
				utils.settings.getHideEmptySidebarProjects.setData(undefined, enabled);
				return { previous };
			},
			onError: (_error, _input, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getHideEmptySidebarProjects.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getHideEmptySidebarProjects.invalidate();
			},
		});
	const setEnabled = useCallback(
		(next: boolean) => mutate({ enabled: next }),
		[mutate],
	);
	return [enabled, setEnabled];
}
