import type { FileOpenMode } from "@superset/local-db";
import { Badge } from "@superset/ui/badge";
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
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

const VOICE_SHORTCUT_SETTINGS_HREF =
	"#/settings/keyboard?shortcut=VOICE_INPUT_TOGGLE";

interface BehaviorSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

type MicrophonePermissionStatus =
	| "granted"
	| "denied"
	| "promptable"
	| "unknown";

function getMicrophoneReadinessCopy({
	isLoading,
	status,
}: {
	isLoading: boolean;
	status: MicrophonePermissionStatus | undefined;
}) {
	if (isLoading) {
		return {
			actionLabel: null,
			badge: "Checking",
			description: "Checking microphone access before voice input starts.",
			label: "Checking microphone access",
			variant: "outline" as const,
		};
	}

	if (status === "granted") {
		return {
			actionLabel: null,
			badge: "Ready",
			description: "Voice input can use the microphone.",
			label: "Microphone is ready",
			variant: "secondary" as const,
		};
	}

	if (status === "denied") {
		return {
			actionLabel: "Open settings",
			badge: "Blocked",
			description:
				"Allow microphone access in System Settings to use dictation.",
			label: "Microphone access is blocked",
			variant: "outline" as const,
		};
	}

	if (status === "promptable") {
		return {
			actionLabel: "Grant access",
			badge: "Action needed",
			description:
				"Grant microphone access when you are ready to use dictation.",
			label: "Microphone access is needed",
			variant: "outline" as const,
		};
	}

	return {
		actionLabel: "Open settings",
		badge: "Unknown",
		description: "Check microphone access in System Settings before dictating.",
		label: "Microphone status is unavailable",
		variant: "outline" as const,
	};
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
	const showVoiceInput = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_VOICE_INPUT,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();
	const voiceShortcutDisplay = useHotkeyDisplay("VOICE_INPUT_TOGGLE");
	const voiceShortcutText = voiceShortcutDisplay.text;
	const canDisplayVoiceShortcut =
		voiceShortcutText.length > 0 && voiceShortcutText !== "Unassigned";

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

	const { data: voiceInputEnabled, isLoading: isVoiceInputLoading } =
		electronTrpc.settings.getVoiceInputEnabled.useQuery();
	const setVoiceInputEnabled =
		electronTrpc.settings.setVoiceInputEnabled.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getVoiceInputEnabled.cancel();
				const previous = utils.settings.getVoiceInputEnabled.getData();
				utils.settings.getVoiceInputEnabled.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getVoiceInputEnabled.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getVoiceInputEnabled.invalidate();
			},
		});

	const { data: permissionStatus, isLoading: isPermissionStatusLoading } =
		electronTrpc.permissions.getStatus.useQuery(undefined, {
			enabled: showVoiceInput,
			refetchInterval: 2000,
		});
	const requestMicrophone =
		electronTrpc.permissions.requestMicrophone.useMutation({
			onSettled: () => {
				utils.permissions.getStatus.invalidate();
			},
		});
	const microphoneReadiness = getMicrophoneReadinessCopy({
		isLoading: isPermissionStatusLoading,
		status: permissionStatus?.microphoneStatus,
	});

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
								Open links in the in-app browser
							</Label>
							<p className="text-xs text-muted-foreground">
								Open links from chat and terminal in the in-app browser instead
								of your default browser
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

				{showVoiceInput && (
					<div className="space-y-4">
						<div className="flex items-center justify-between gap-6">
							<div className="min-w-0 flex-1 space-y-0.5">
								<Label htmlFor="voice-input" className="text-sm font-medium">
									Voice Input
								</Label>
								<p className="text-xs text-muted-foreground">
									Enable voice input for hands-free dictation controls
								</p>
								<p
									id="voice-input-status"
									className={
										setVoiceInputEnabled.isError
											? "text-xs text-destructive"
											: "text-xs text-muted-foreground"
									}
								>
									{setVoiceInputEnabled.isError
										? "Voice preference could not be saved"
										: isVoiceInputLoading
											? "Loading voice preference"
											: voiceInputEnabled
												? "Voice input is enabled"
												: "Voice input is disabled"}
								</p>
							</div>
							<Switch
								aria-describedby="voice-input-status"
								id="voice-input"
								checked={voiceInputEnabled ?? false}
								onCheckedChange={(enabled) =>
									setVoiceInputEnabled.mutate({ enabled })
								}
								disabled={isVoiceInputLoading || setVoiceInputEnabled.isPending}
							/>
						</div>
						<div className="flex items-center justify-between gap-6 rounded-md border border-border/60 p-3">
							<div className="min-w-0 flex-1 space-y-1">
								<div className="flex flex-wrap items-center gap-2">
									<Label className="text-sm font-medium">
										Microphone readiness
									</Label>
									<Badge variant={microphoneReadiness.variant}>
										{microphoneReadiness.badge}
									</Badge>
								</div>
								<p className="text-xs text-muted-foreground">
									{microphoneReadiness.label}
								</p>
								<p className="text-xs text-muted-foreground">
									{microphoneReadiness.description}
								</p>
								<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
									<span className="font-medium text-foreground">
										Voice Shortcut
									</span>
									{canDisplayVoiceShortcut ? (
										<span>{voiceShortcutText}</span>
									) : (
										<span>Shortcut unavailable</span>
									)}
									<a
										className="text-primary underline-offset-4 hover:underline"
										data-testid="behavior-voice-shortcut-link"
										href={VOICE_SHORTCUT_SETTINGS_HREF}
									>
										{canDisplayVoiceShortcut
											? "Edit shortcut"
											: "Reset in Keyboard Shortcuts"}
									</a>
								</div>
							</div>
							{microphoneReadiness.actionLabel ? (
								<Button
									disabled={requestMicrophone.isPending}
									onClick={() => requestMicrophone.mutate()}
									size="sm"
									variant="outline"
								>
									{microphoneReadiness.actionLabel}
								</Button>
							) : null}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
