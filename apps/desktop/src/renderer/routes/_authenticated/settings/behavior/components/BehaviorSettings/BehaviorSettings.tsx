import type { FileOpenMode } from "@superset/local-db";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { VscodeDisableConfirmDialog } from "./components/VscodeDisableConfirmDialog";

interface BehaviorSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function BehaviorSettings({ visibleItems }: BehaviorSettingsProps) {
	const showConfirmQuit = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_CONFIRM_QUIT,
		visibleItems,
	);
	const showFileOpenMode = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_FILE_OPEN_MODE,
		visibleItems,
	);
	const showResourceMonitor = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_RESOURCE_MONITOR,
		visibleItems,
	);
	const showOpenLinksInApp = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_OPEN_LINKS_IN_APP,
		visibleItems,
	);
	const showVscodeBeta = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_VSCODE_BETA,
		visibleItems,
	);

	const [vscodeBetaConfirmOpen, setVscodeBetaConfirmOpen] = useState(false);

	const vscodePaneCount = useTabsStore(
		(s) => Object.values(s.panes).filter((p) => p.type === "vscode").length,
	);
	const removePane = useTabsStore((s) => s.removePane);

	const utils = electronTrpc.useUtils();

	const { data: confirmOnQuit, isLoading: isConfirmLoading } =
		electronTrpc.settings.getConfirmOnQuit.useQuery();
	const setConfirmOnQuit = electronTrpc.settings.setConfirmOnQuit.useMutation({
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

	const handleConfirmToggle = (enabled: boolean) => {
		setConfirmOnQuit.mutate({ enabled });
	};

	const { data: fileOpenMode, isLoading: isFileOpenModeLoading } =
		electronTrpc.settings.getFileOpenMode.useQuery();
	const setFileOpenMode = electronTrpc.settings.setFileOpenMode.useMutation({
		onMutate: async ({ mode }) => {
			await utils.settings.getFileOpenMode.cancel();
			const previous = utils.settings.getFileOpenMode.getData();
			utils.settings.getFileOpenMode.setData(undefined, mode);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getFileOpenMode.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getFileOpenMode.invalidate();
		},
	});

	const { data: resourceMonitorEnabled, isLoading: isResourceMonitorLoading } =
		electronTrpc.settings.getShowResourceMonitor.useQuery();
	const setShowResourceMonitor =
		electronTrpc.settings.setShowResourceMonitor.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getShowResourceMonitor.cancel();
				const previous = utils.settings.getShowResourceMonitor.getData();
				utils.settings.getShowResourceMonitor.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getShowResourceMonitor.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getShowResourceMonitor.invalidate();
			},
		});

	const { data: openLinksInApp, isLoading: isOpenLinksInAppLoading } =
		electronTrpc.settings.getOpenLinksInApp.useQuery();
	const setOpenLinksInApp = electronTrpc.settings.setOpenLinksInApp.useMutation(
		{
			onMutate: async ({ enabled }) => {
				await utils.settings.getOpenLinksInApp.cancel();
				const previous = utils.settings.getOpenLinksInApp.getData();
				utils.settings.getOpenLinksInApp.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getOpenLinksInApp.setData(undefined, context.previous);
				}
			},
			onSettled: () => {
				utils.settings.getOpenLinksInApp.invalidate();
			},
		},
	);

	const { data: vscodeBetaEnabled, isLoading: isVscodeBetaLoading } =
		electronTrpc.settings.getVscodeBetaEnabled.useQuery();
	const setVscodeBetaEnabled =
		electronTrpc.settings.setVscodeBetaEnabled.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getVscodeBetaEnabled.cancel();
				const previous = utils.settings.getVscodeBetaEnabled.getData();
				utils.settings.getVscodeBetaEnabled.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getVscodeBetaEnabled.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getVscodeBetaEnabled.invalidate();
			},
		});

	const handleVscodeBetaToggle = (enabled: boolean) => {
		if (!enabled && vscodePaneCount > 0) {
			setVscodeBetaConfirmOpen(true);
		} else {
			setVscodeBetaEnabled.mutate({ enabled });
		}
	};

	const handleVscodeBetaConfirm = () => {
		// Persist the setting first so a mutation failure (onError rolls the
		// cache back to `true`) doesn't leave the user with "VS Code: ON" and
		// no panes. Only tear down panes once the server accepts the disable.
		setVscodeBetaEnabled.mutate(
			{ enabled: false },
			{
				onSuccess: () => {
					const panes = useTabsStore.getState().panes;
					for (const [paneId, pane] of Object.entries(panes)) {
						if (pane.type === "vscode") {
							removePane(paneId);
						}
					}
				},
			},
		);
		setVscodeBetaConfirmOpen(false);
	};

	return (
		<>
			<div className="p-6 max-w-4xl w-full">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">General</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Configure general app preferences
					</p>
				</div>

				<div className="space-y-6">
					{showConfirmQuit && (
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label
									htmlFor="confirm-on-quit"
									className="text-sm font-medium"
								>
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
					)}

					{showVscodeBeta && (
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label htmlFor="vscode-beta" className="text-sm font-medium">
									VS Code (Beta)
								</Label>
								<p className="text-xs text-muted-foreground">
									Enable the embedded VS Code editor as a tab type. Disable if
									it causes issues.
								</p>
							</div>
							<Switch
								id="vscode-beta"
								checked={vscodeBetaEnabled ?? true}
								onCheckedChange={handleVscodeBetaToggle}
								disabled={
									isVscodeBetaLoading ||
									setVscodeBetaEnabled.isPending ||
									vscodeBetaConfirmOpen
								}
							/>
						</div>
					)}

					{showFileOpenMode && (
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label className="text-sm font-medium">File open mode</Label>
								<p className="text-xs text-muted-foreground">
									Choose how files open when no preview pane exists
								</p>
							</div>
							<Select
								value={fileOpenMode ?? "split-pane"}
								onValueChange={(value) =>
									setFileOpenMode.mutate({ mode: value as FileOpenMode })
								}
								disabled={isFileOpenModeLoading || setFileOpenMode.isPending}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="split-pane">Split pane</SelectItem>
									<SelectItem value="new-tab">New tab</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}

					{showResourceMonitor && (
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label
									htmlFor="resource-monitor"
									className="text-sm font-medium"
								>
									Resource monitor
								</Label>
								<p className="text-xs text-muted-foreground">
									Show CPU and memory usage in the top bar
								</p>
							</div>
							<Switch
								id="resource-monitor"
								checked={resourceMonitorEnabled ?? false}
								onCheckedChange={(enabled) =>
									setShowResourceMonitor.mutate({ enabled })
								}
								disabled={
									isResourceMonitorLoading || setShowResourceMonitor.isPending
								}
							/>
						</div>
					)}

					{showOpenLinksInApp && (
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label
									htmlFor="open-links-in-app"
									className="text-sm font-medium"
								>
									Open links in app browser
								</Label>
								<p className="text-xs text-muted-foreground">
									Open links from chat and terminal in the built-in browser
									instead of your default browser
								</p>
							</div>
							<Switch
								id="open-links-in-app"
								checked={openLinksInApp ?? false}
								onCheckedChange={(enabled) =>
									setOpenLinksInApp.mutate({ enabled })
								}
								disabled={
									isOpenLinksInAppLoading || setOpenLinksInApp.isPending
								}
							/>
						</div>
					)}
				</div>
			</div>

			<VscodeDisableConfirmDialog
				open={vscodeBetaConfirmOpen}
				onOpenChange={setVscodeBetaConfirmOpen}
				onConfirm={handleVscodeBetaConfirm}
				vscodePaneCount={vscodePaneCount}
			/>
		</>
	);
}
