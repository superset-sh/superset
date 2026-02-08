import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DEFAULT_APPLY_PRESET_ON_NEW_TAB } from "shared/constants";

export function ApplyPresetOnNewTabSetting() {
	const utils = electronTrpc.useUtils();

	const { data: applyPresetOnNewTab, isLoading } =
		electronTrpc.settings.getApplyPresetOnNewTab.useQuery();

	const setApplyPresetOnNewTab =
		electronTrpc.settings.setApplyPresetOnNewTab.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getApplyPresetOnNewTab.cancel();
				const previous = utils.settings.getApplyPresetOnNewTab.getData();
				utils.settings.getApplyPresetOnNewTab.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getApplyPresetOnNewTab.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getApplyPresetOnNewTab.invalidate();
			},
		});

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label
					htmlFor="apply-preset-on-new-tab"
					className="text-sm font-medium"
				>
					Apply preset on new tab
				</Label>
				<p className="text-xs text-muted-foreground">
					Automatically apply your default preset when opening new tabs, panes,
					or splits
				</p>
			</div>
			<Switch
				id="apply-preset-on-new-tab"
				checked={applyPresetOnNewTab ?? DEFAULT_APPLY_PRESET_ON_NEW_TAB}
				onCheckedChange={(enabled) =>
					setApplyPresetOnNewTab.mutate({ enabled })
				}
				disabled={isLoading || setApplyPresetOnNewTab.isPending}
			/>
		</div>
	);
}
