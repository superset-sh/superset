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

type NavigationStyle = "top-bar" | "sidebar";

export function BehaviorSettings() {
	const utils = trpc.useUtils();

	// Confirm on quit setting
	const { data: confirmOnQuit, isLoading: isConfirmLoading } =
		trpc.settings.getConfirmOnQuit.useQuery();
	const setConfirmOnQuit = trpc.settings.setConfirmOnQuit.useMutation({
		onMutate: async ({ enabled }) => {
			await utils.settings.getConfirmOnQuit.cancel();
			const previous = utils.settings.getConfirmOnQuit.getData();
			utils.settings.getConfirmOnQuit.setData(undefined, enabled);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getConfirmOnQuit.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getConfirmOnQuit.invalidate();
		},
	});

	// Navigation style setting
	const { data: navigationStyle, isLoading: isNavLoading } =
		trpc.settings.getNavigationStyle.useQuery();
	const setNavigationStyle = trpc.settings.setNavigationStyle.useMutation({
		onMutate: async ({ style }) => {
			await utils.settings.getNavigationStyle.cancel();
			const previous = utils.settings.getNavigationStyle.getData();
			utils.settings.getNavigationStyle.setData(undefined, style);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getNavigationStyle.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getNavigationStyle.invalidate();
		},
	});

	const handleConfirmToggle = (enabled: boolean) => {
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

	const handleNavigationStyleChange = (style: NavigationStyle) => {
		setNavigationStyle.mutate({ style });
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
				{/* Navigation Style */}
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label htmlFor="navigation-style" className="text-sm font-medium">
							Navigation style
						</Label>
						<p className="text-xs text-muted-foreground">
							Choose how workspaces are displayed
						</p>
					</div>
					<Select
						value={navigationStyle ?? "top-bar"}
						onValueChange={handleNavigationStyleChange}
						disabled={isNavLoading || setNavigationStyle.isPending}
					>
						<SelectTrigger id="navigation-style" className="w-[140px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="top-bar">Top bar</SelectItem>
							<SelectItem value="sidebar">Sidebar</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Confirm on Quit */}
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
						onCheckedChange={handleConfirmToggle}
						disabled={isConfirmLoading || setConfirmOnQuit.isPending}
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
