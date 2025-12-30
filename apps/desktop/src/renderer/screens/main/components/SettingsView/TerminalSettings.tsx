import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
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

	const restartDaemon = trpc.settings.restartDaemon.useMutation({
		onSuccess: () => {
			toast.success("Terminal daemon restarted", {
				description: "Reloading window to reset terminal connections...",
			});
			// Reload the window after a short delay to let the toast show
			// This ensures all terminal components get fresh state
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		},
		onError: (error) => {
			toast.error("Failed to restart daemon", {
				description: error.message,
			});
		},
	});

	const handleToggle = (enabled: boolean) => {
		setTerminalPersistence.mutate({ enabled });
	};

	const handleRestartDaemon = () => {
		restartDaemon.mutate();
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
							Keep terminal sessions alive across app restarts. TUI apps like
							Claude Code will resume exactly where you left off.
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

				{/* Daemon Management - only show when persistence is enabled */}
				{terminalPersistence && (
					<div className="pt-6 border-t">
						<h3 className="text-sm font-medium mb-2">Terminal Daemon</h3>
						<p className="text-sm text-muted-foreground mb-4">
							Restart the terminal daemon to pick up new code after an app
							update. This will close all terminal sessions.
						</p>
						<Button
							variant="outline"
							onClick={handleRestartDaemon}
							disabled={restartDaemon.isPending}
						>
							{restartDaemon.isPending ? "Restarting..." : "Restart Daemon"}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
