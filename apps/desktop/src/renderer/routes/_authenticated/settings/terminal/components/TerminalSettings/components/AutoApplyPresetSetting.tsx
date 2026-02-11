import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DEFAULT_AUTO_APPLY_DEFAULT_PRESET } from "shared/constants";

export function AutoApplyPresetSetting() {
	const utils = electronTrpc.useUtils();

	const { data: autoApplyDefaultPreset, isLoading } =
		electronTrpc.settings.getAutoApplyDefaultPreset.useQuery();

	const setAutoApplyDefaultPreset =
		electronTrpc.settings.setAutoApplyDefaultPreset.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getAutoApplyDefaultPreset.cancel();
				const previous = utils.settings.getAutoApplyDefaultPreset.getData();
				utils.settings.getAutoApplyDefaultPreset.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getAutoApplyDefaultPreset.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getAutoApplyDefaultPreset.invalidate();
			},
		});

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor="auto-apply-preset" className="text-sm font-medium">
					Auto-apply default preset
				</Label>
				<p className="text-xs text-muted-foreground">
					Automatically apply the workspace creation preset when creating new
					workspaces
				</p>
			</div>
			<Switch
				id="auto-apply-preset"
				checked={autoApplyDefaultPreset ?? DEFAULT_AUTO_APPLY_DEFAULT_PRESET}
				onCheckedChange={(enabled) =>
					setAutoApplyDefaultPreset.mutate({ enabled })
				}
				disabled={isLoading || setAutoApplyDefaultPreset.isPending}
			/>
		</div>
	);
}
