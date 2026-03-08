import type { FileOpenMode } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DEFAULT_PROJECT_CONFIGURATION_LAUNCH_PROMPT_TEMPLATE } from "shared/project-configuration";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface BehaviorSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function BehaviorSettings({ visibleItems }: BehaviorSettingsProps) {
	const showConfirmQuit = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_CONFIRM_QUIT,
		visibleItems,
	);
	const showTelemetry = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_TELEMETRY,
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
	const showProjectConfigurationLaunchPrompt = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_PROJECT_CONFIGURATION_LAUNCH_PROMPT,
		visibleItems,
	);

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

	// TODO: remove telemetry query/mutation/handler once telemetry procedures are removed
	const { data: telemetryEnabled, isLoading: isTelemetryLoading } =
		electronTrpc.settings.getTelemetryEnabled.useQuery();
	const setTelemetryEnabled =
		electronTrpc.settings.setTelemetryEnabled.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getTelemetryEnabled.cancel();
				const previous = utils.settings.getTelemetryEnabled.getData();
				utils.settings.getTelemetryEnabled.setData(undefined, enabled);
				return { previous };
			},
			onError: (err, _vars, context) => {
				console.error("[settings/telemetry] Failed to update:", err);
				if (context?.previous !== undefined) {
					utils.settings.getTelemetryEnabled.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getTelemetryEnabled.invalidate();
			},
		});

	const handleTelemetryToggle = (enabled: boolean) => {
		console.log("[settings/telemetry] Toggling to:", enabled);
		setTelemetryEnabled.mutate({ enabled });
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

	const {
		data: projectConfigurationLaunchPrompt,
		isLoading: isProjectConfigurationLaunchPromptLoading,
	} = electronTrpc.settings.getProjectConfigurationLaunchPrompt.useQuery();
	const setProjectConfigurationLaunchPrompt =
		electronTrpc.settings.setProjectConfigurationLaunchPrompt.useMutation({
			onSettled: () => {
				utils.settings.getProjectConfigurationLaunchPrompt.invalidate();
			},
		});
	const [
		projectConfigurationLaunchPromptDraft,
		setProjectConfigurationLaunchPromptDraft,
	] = useState(DEFAULT_PROJECT_CONFIGURATION_LAUNCH_PROMPT_TEMPLATE);

	useEffect(() => {
		if (projectConfigurationLaunchPrompt === undefined) return;
		setProjectConfigurationLaunchPromptDraft(projectConfigurationLaunchPrompt);
	}, [projectConfigurationLaunchPrompt]);

	const hasProjectConfigurationPromptChanges =
		projectConfigurationLaunchPromptDraft !==
		(projectConfigurationLaunchPrompt ??
			DEFAULT_PROJECT_CONFIGURATION_LAUNCH_PROMPT_TEMPLATE);

	return (
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
							<Label htmlFor="resource-monitor" className="text-sm font-medium">
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
							disabled={isOpenLinksInAppLoading || setOpenLinksInApp.isPending}
						/>
					</div>
				)}

				{false && showTelemetry && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label htmlFor="telemetry" className="text-sm font-medium">
								Send anonymous usage data
							</Label>
							<p className="text-xs text-muted-foreground">
								Help improve Superset by sending anonymous usage data
							</p>
						</div>
						<Switch
							id="telemetry"
							checked={telemetryEnabled ?? true}
							onCheckedChange={handleTelemetryToggle}
							disabled={isTelemetryLoading || setTelemetryEnabled.isPending}
						/>
					</div>
				)}

				{showProjectConfigurationLaunchPrompt && (
					<div className="space-y-3">
						<div className="space-y-0.5">
							<Label
								htmlFor="project-configuration-launch-prompt"
								className="text-sm font-medium"
							>
								New project agent launch prompt
							</Label>
							<p className="text-xs text-muted-foreground">
								Used when a newly opened project launches an agent before it has
								been configured for Superset. Supports{" "}
								<code>{"{{show_command}}"}</code>,{" "}
								<code>{"{{write_command}}"}</code>,{" "}
								<code>{"{{project_root}}"}</code>, and{" "}
								<code>{"{{user_request}}"}</code>.
							</p>
						</div>
						<Textarea
							id="project-configuration-launch-prompt"
							className="min-h-52 font-mono text-xs"
							value={projectConfigurationLaunchPromptDraft}
							onChange={(event) =>
								setProjectConfigurationLaunchPromptDraft(event.target.value)
							}
							disabled={
								isProjectConfigurationLaunchPromptLoading ||
								setProjectConfigurationLaunchPrompt.isPending
							}
						/>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								onClick={() => {
									setProjectConfigurationLaunchPromptDraft(
										DEFAULT_PROJECT_CONFIGURATION_LAUNCH_PROMPT_TEMPLATE,
									);
									setProjectConfigurationLaunchPrompt.mutate({ prompt: null });
								}}
								disabled={
									isProjectConfigurationLaunchPromptLoading ||
									setProjectConfigurationLaunchPrompt.isPending
								}
							>
								Reset
							</Button>
							<Button
								onClick={() =>
									setProjectConfigurationLaunchPrompt.mutate({
										prompt: projectConfigurationLaunchPromptDraft,
									})
								}
								disabled={
									!hasProjectConfigurationPromptChanges ||
									isProjectConfigurationLaunchPromptLoading ||
									setProjectConfigurationLaunchPrompt.isPending
								}
							>
								Save prompt
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
