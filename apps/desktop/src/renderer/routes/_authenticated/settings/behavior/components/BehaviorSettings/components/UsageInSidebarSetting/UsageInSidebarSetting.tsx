import { useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function UsageInSidebarSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();
	const { data: usageInSidebarEnabled, isLoading } =
		electronTrpc.settings.getShowUsageInSidebar.useQuery();
	const setShowUsageInSidebar =
		electronTrpc.settings.setShowUsageInSidebar.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getShowUsageInSidebar.cancel();
				const previous = utils.settings.getShowUsageInSidebar.getData();
				utils.settings.getShowUsageInSidebar.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getShowUsageInSidebar.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getShowUsageInSidebar.invalidate();
			},
		});

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="usage-in-sidebar" className="text-sm font-medium">
					<HighlightText
						text={t({
							message: "Show usage tab on sidebar",
						})}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							message:
								"Show a Usage button in the home sidebar, under Pull requests",
						})}
						query={searchQuery}
					/>
				</p>
			</div>
			<Switch
				id="usage-in-sidebar"
				checked={usageInSidebarEnabled ?? false}
				onCheckedChange={(enabled) => setShowUsageInSidebar.mutate({ enabled })}
				disabled={
					isLoading ||
					usageInSidebarEnabled === undefined ||
					setShowUsageInSidebar.isPending
				}
			/>
		</div>
	);
}
