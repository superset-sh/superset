import type { TerminalLinkBehavior } from "@superset/local-db";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { trpc } from "renderer/lib/trpc";

export function BehaviorSettings() {
	const utils = trpc.useUtils();
	const { data: confirmOnQuit, isLoading } =
		trpc.settings.getConfirmOnQuit.useQuery();
	const setConfirmOnQuit = trpc.settings.setConfirmOnQuit.useMutation({
		onMutate: async ({ enabled }) => {
			// Cancel outgoing fetches
			await utils.settings.getConfirmOnQuit.cancel();
			// Snapshot previous value
			const previous = utils.settings.getConfirmOnQuit.getData();
			// Optimistically update
			utils.settings.getConfirmOnQuit.setData(undefined, enabled);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			// Rollback on error
			if (context?.previous !== undefined) {
				utils.settings.getConfirmOnQuit.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			// Refetch to ensure sync with server
			utils.settings.getConfirmOnQuit.invalidate();
		},
	});

	const handleToggle = (enabled: boolean) => {
		setConfirmOnQuit.mutate({ enabled });
	};

	// Terminal link behavior setting
	const { data: terminalLinkBehavior, isLoading: isLoadingLinkBehavior } =
		trpc.settings.getTerminalLinkBehavior.useQuery();

	const setTerminalLinkBehavior =
		trpc.settings.setTerminalLinkBehavior.useMutation({
			onMutate: async ({ behavior }) => {
				await utils.settings.getTerminalLinkBehavior.cancel();
				const previous = utils.settings.getTerminalLinkBehavior.getData();
				utils.settings.getTerminalLinkBehavior.setData(undefined, behavior);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getTerminalLinkBehavior.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getTerminalLinkBehavior.invalidate();
			},
		});

	const handleLinkBehaviorChange = (value: string) => {
		setTerminalLinkBehavior.mutate({
			behavior: value as TerminalLinkBehavior,
		});
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Behavior</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure app behavior and preferences
				</p>
			</div>

			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label htmlFor="confirm-on-quit" className="text-sm font-medium">
							Confirm before quitting
						</Label>
						<p className="text-xs text-muted-foreground">
							Show a confirmation dialog when quitting the app
						</p>
					</div>
					<Switch
						id="confirm-on-quit"
						checked={confirmOnQuit ?? true}
						onCheckedChange={handleToggle}
						disabled={isLoading || setConfirmOnQuit.isPending}
					/>
				</div>

				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label
							htmlFor="terminal-link-behavior"
							className="text-sm font-medium"
						>
							Terminal file links
						</Label>
						<p className="text-xs text-muted-foreground">
							Choose how to open file paths when Cmd+clicking in the terminal
						</p>
					</div>
					<Select
						value={terminalLinkBehavior ?? "external-editor"}
						onValueChange={handleLinkBehaviorChange}
						disabled={
							isLoadingLinkBehavior || setTerminalLinkBehavior.isPending
						}
					>
						<SelectTrigger className="w-[180px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="external-editor">External editor</SelectItem>
							<SelectItem value="file-viewer">File viewer</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	);
}
