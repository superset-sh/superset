import { Trans } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function UsageSidebarToggle() {
	const utils = electronTrpc.useUtils();
	const { data: usageInSidebarEnabled, isLoading: isUsageInSidebarLoading } =
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
		<div className="flex shrink-0 items-center gap-3">
			<Label
				htmlFor="usage-in-sidebar"
				className="text-xs text-muted-foreground"
			>
				<Trans>Show usage tab on sidebar</Trans>
			</Label>
			<span id="usage-in-sidebar-description" className="sr-only">
				<Trans>
					Show a Usage button in the home sidebar, under Pull requests
				</Trans>
			</span>
			<Switch
				id="usage-in-sidebar"
				aria-describedby="usage-in-sidebar-description"
				checked={usageInSidebarEnabled ?? false}
				onCheckedChange={(enabled) => setShowUsageInSidebar.mutate({ enabled })}
				disabled={
					isUsageInSidebarLoading ||
					usageInSidebarEnabled === undefined ||
					setShowUsageInSidebar.isPending
				}
			/>
		</div>
	);
}
