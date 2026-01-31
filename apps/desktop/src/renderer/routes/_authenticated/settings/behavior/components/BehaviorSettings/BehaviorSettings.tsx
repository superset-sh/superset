import type { BranchPrefixMode } from "@superset/local-db";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { resolveBranchPrefix, sanitizeSegment } from "shared/utils/branch";
import { BRANCH_PREFIX_MODE_LABELS } from "../../../utils/branch-prefix";
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
	const showBranchPrefix = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_BRANCH_PREFIX,
		visibleItems,
	);
	const showVoiceCommands = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_VOICE_COMMANDS,
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

	const { data: voiceCommandsEnabled, isLoading: isVoiceLoading } =
		electronTrpc.settings.getVoiceCommandsEnabled.useQuery();
	const setVoiceCommandsEnabled =
		electronTrpc.settings.setVoiceCommandsEnabled.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getVoiceCommandsEnabled.cancel();
				const previous = utils.settings.getVoiceCommandsEnabled.getData();
				utils.settings.getVoiceCommandsEnabled.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getVoiceCommandsEnabled.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getVoiceCommandsEnabled.invalidate();
			},
		});

	const { data: micPermission } = electronTrpc.voice.getMicPermission.useQuery(
		undefined,
		{
			refetchOnWindowFocus: true,
		},
	);

	const requestMicPermission =
		electronTrpc.voice.requestMicPermission.useMutation({
			onSuccess: ({ granted }) => {
				utils.voice.getMicPermission.invalidate();
				if (granted) {
					setVoiceCommandsEnabled.mutate({ enabled: true });
				}
			},
		});

	const openUrl = electronTrpc.external.openUrl.useMutation();

	const micDenied =
		micPermission === "denied" || micPermission === "restricted";

	const handleVoiceToggle = (enabled: boolean) => {
		if (!enabled) {
			setVoiceCommandsEnabled.mutate({ enabled: false });
			return;
		}

		if (micPermission === "granted") {
			setVoiceCommandsEnabled.mutate({ enabled: true });
			return;
		}

		if (micPermission === "not-determined") {
			requestMicPermission.mutate();
			return;
		}
	};

	const { data: branchPrefix, isLoading: isBranchPrefixLoading } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();

	const [customPrefixInput, setCustomPrefixInput] = useState(
		branchPrefix?.customPrefix ?? "",
	);

	useEffect(() => {
		setCustomPrefixInput(branchPrefix?.customPrefix ?? "");
	}, [branchPrefix?.customPrefix]);

	const setBranchPrefix = electronTrpc.settings.setBranchPrefix.useMutation({
		onError: (err) => {
			console.error("[settings/branch-prefix] Failed to update:", err);
		},
		onSettled: () => {
			utils.settings.getBranchPrefix.invalidate();
		},
	});

	const handleBranchPrefixModeChange = (mode: BranchPrefixMode) => {
		setBranchPrefix.mutate({
			mode,
			customPrefix: customPrefixInput || null,
		});
	};

	const handleCustomPrefixBlur = () => {
		const sanitized = sanitizeSegment(customPrefixInput);
		setCustomPrefixInput(sanitized);
		setBranchPrefix.mutate({
			mode: "custom",
			customPrefix: sanitized || null,
		});
	};

	const previewPrefix =
		resolveBranchPrefix({
			mode: branchPrefix?.mode ?? "none",
			customPrefix: customPrefixInput,
			authorPrefix: gitInfo?.authorPrefix,
			githubUsername: gitInfo?.githubUsername,
		}) ||
		(branchPrefix?.mode === "author"
			? "author-name"
			: branchPrefix?.mode === "github"
				? "username"
				: null);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Features</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure app features and preferences
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

				{showVoiceCommands && (
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label htmlFor="voice-commands" className="text-sm font-medium">
									Voice Commands
								</Label>
								<p className="text-xs text-muted-foreground">
									Enable wake word detection and voice commands
								</p>
							</div>
							<Switch
								id="voice-commands"
								checked={voiceCommandsEnabled ?? false}
								onCheckedChange={handleVoiceToggle}
								disabled={
									isVoiceLoading ||
									setVoiceCommandsEnabled.isPending ||
									requestMicPermission.isPending ||
									micDenied
								}
							/>
						</div>
						{micDenied && (
							<p className="text-xs text-destructive">
								Microphone access was denied.{" "}
								<button
									type="button"
									className="underline hover:no-underline"
									onClick={() =>
										openUrl.mutate(
											"x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
										)
									}
								>
									Open System Settings
								</button>{" "}
								to grant access, then return to this window.
							</p>
						)}
					</div>
				)}

				{showBranchPrefix && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">Branch Prefix</Label>
							<p className="text-xs text-muted-foreground">
								Preview:{" "}
								<code className="bg-muted px-1.5 py-0.5 rounded text-foreground">
									{previewPrefix
										? `${previewPrefix}/branch-name`
										: "branch-name"}
								</code>
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Select
								value={branchPrefix?.mode ?? "none"}
								onValueChange={(value) =>
									handleBranchPrefixModeChange(value as BranchPrefixMode)
								}
								disabled={isBranchPrefixLoading || setBranchPrefix.isPending}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(
										Object.entries(BRANCH_PREFIX_MODE_LABELS) as [
											BranchPrefixMode,
											string,
										][]
									).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{branchPrefix?.mode === "custom" && (
								<Input
									placeholder="Prefix"
									value={customPrefixInput}
									onChange={(e) => setCustomPrefixInput(e.target.value)}
									onBlur={handleCustomPrefixBlur}
									className="w-[120px]"
									disabled={isBranchPrefixLoading || setBranchPrefix.isPending}
								/>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
