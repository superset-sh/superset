import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Experimental toggle for the wait-for-setup agent gate. Self-contained
 * (owns its query and mutation) so it can be moved or removed as a unit —
 * the launch-side gating lives in `buildSetupPaneLaunchRequest` (v1) and the
 * host `workspaces.create` chaining (v2).
 */
export function WaitForSetupBeforeAgentSetting() {
	const utils = electronTrpc.useUtils();
	const { data: waitForSetupBeforeAgent, isLoading } =
		electronTrpc.settings.getWaitForSetupBeforeAgent.useQuery();
	const setWaitForSetupBeforeAgent =
		electronTrpc.settings.setWaitForSetupBeforeAgent.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getWaitForSetupBeforeAgent.cancel();
				const previous = utils.settings.getWaitForSetupBeforeAgent.getData();
				utils.settings.getWaitForSetupBeforeAgent.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getWaitForSetupBeforeAgent.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getWaitForSetupBeforeAgent.invalidate();
			},
		});

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label
					htmlFor="wait-for-setup-before-agent"
					className="text-sm font-medium"
				>
					Wait for workspace setup before starting agents
				</Label>
				<p className="text-xs text-muted-foreground">
					Run the agent in the Workspace Setup terminal once setup finishes
					instead of starting a second terminal alongside it
				</p>
			</div>
			<Switch
				id="wait-for-setup-before-agent"
				checked={waitForSetupBeforeAgent ?? false}
				onCheckedChange={(enabled) =>
					setWaitForSetupBeforeAgent.mutate({ enabled })
				}
				disabled={isLoading || setWaitForSetupBeforeAgent.isPending}
			/>
		</div>
	);
}
