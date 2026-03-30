import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function SwapPanelsSection() {
	const utils = electronTrpc.useUtils();

	const { data: swapPanels, isLoading } =
		electronTrpc.settings.getSwapPanels.useQuery();
	const setSwapPanels = electronTrpc.settings.setSwapPanels.useMutation({
		onMutate: async ({ enabled }) => {
			await utils.settings.getSwapPanels.cancel();
			const previous = utils.settings.getSwapPanels.getData();
			utils.settings.getSwapPanels.setData(undefined, enabled);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getSwapPanels.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getSwapPanels.invalidate();
		},
	});

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor="swap-panels" className="text-sm font-medium">
					Swap sidebar panels
				</Label>
				<p className="text-xs text-muted-foreground">
					Move files and git changes to the left, workspaces to the right
				</p>
			</div>
			<Switch
				id="swap-panels"
				checked={swapPanels ?? false}
				onCheckedChange={(enabled) => setSwapPanels.mutate({ enabled })}
				disabled={isLoading || setSwapPanels.isPending}
			/>
		</div>
	);
}
