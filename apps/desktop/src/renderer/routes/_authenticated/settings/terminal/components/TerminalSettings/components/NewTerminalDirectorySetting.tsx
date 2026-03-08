import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function NewTerminalDirectorySetting() {
	const utils = electronTrpc.useUtils();
	const { data: enabled, isLoading } =
		electronTrpc.settings.getNewTerminalInCurrentTabDirectory.useQuery();
	const setEnabled =
		electronTrpc.settings.setNewTerminalInCurrentTabDirectory.useMutation({
			onMutate: async ({ enabled: nextEnabled }) => {
				await utils.settings.getNewTerminalInCurrentTabDirectory.cancel();
				const previous =
					utils.settings.getNewTerminalInCurrentTabDirectory.getData();
				utils.settings.getNewTerminalInCurrentTabDirectory.setData(
					undefined,
					nextEnabled,
				);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getNewTerminalInCurrentTabDirectory.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getNewTerminalInCurrentTabDirectory.invalidate();
			},
		});

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label
					htmlFor="new-terminal-in-current-tab-directory"
					className="text-sm font-medium"
				>
					New terminals follow current tab directory
				</Label>
				<p className="text-xs text-muted-foreground">
					Open new terminals in the active tab&apos;s directory when Superset
					can resolve one
				</p>
			</div>
			<Switch
				id="new-terminal-in-current-tab-directory"
				checked={enabled ?? true}
				onCheckedChange={(nextEnabled) =>
					setEnabled.mutate({ enabled: nextEnabled })
				}
				disabled={isLoading || setEnabled.isPending}
			/>
		</div>
	);
}
