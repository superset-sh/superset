import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { trpc } from "renderer/lib/trpc";

export function TerminalSettings() {
	const utils = trpc.useUtils();
	const { data: terminalPersistence, isLoading } =
		trpc.settings.getTerminalPersistence.useQuery();
	const setTerminalPersistence =
		trpc.settings.setTerminalPersistence.useMutation({
			onMutate: async ({ enabled }) => {
				// Cancel outgoing fetches
				await utils.settings.getTerminalPersistence.cancel();
				// Snapshot previous value
				const previous = utils.settings.getTerminalPersistence.getData();
				// Optimistically update
				utils.settings.getTerminalPersistence.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				// Rollback on error
				if (context?.previous !== undefined) {
					utils.settings.getTerminalPersistence.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				// Refetch to ensure sync with server
				utils.settings.getTerminalPersistence.invalidate();
			},
		});

	const handleToggle = (enabled: boolean) => {
		setTerminalPersistence.mutate({ enabled });
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Terminal</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure terminal behavior and persistence
				</p>
			</div>

			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label
							htmlFor="terminal-persistence"
							className="text-sm font-medium"
						>
							Terminal persistence
						</Label>
						<p className="text-xs text-muted-foreground">
							Keep terminal sessions alive across app restarts and workspace
							switches. TUI apps like Claude Code will resume exactly where you
							left off.
						</p>
						<p className="text-xs text-muted-foreground/70 mt-1">
							May use more memory with many terminals open. Disable if you
							notice performance issues.
						</p>
						<p className="text-xs text-muted-foreground/70 mt-1">
							Requires app restart to take effect.
						</p>
					</div>
					<Switch
						id="terminal-persistence"
						checked={terminalPersistence ?? false}
						onCheckedChange={handleToggle}
						disabled={isLoading || setTerminalPersistence.isPending}
					/>
				</div>
			</div>
		</div>
	);
}
