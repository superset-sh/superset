import type { BranchPrefixMode, FileOpenMode } from "@superset/local-db";
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
	const showDeleteLocalBranch = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_DELETE_LOCAL_BRANCH,
		visibleItems,
	);
	const showBranchPrefix = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_BRANCH_PREFIX,
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

	const { data: deleteLocalBranch, isLoading: isDeleteBranchLoading } =
		electronTrpc.settings.getDeleteLocalBranch.useQuery();
	const setDeleteLocalBranch =
		electronTrpc.settings.setDeleteLocalBranch.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getDeleteLocalBranch.cancel();
				const previous = utils.settings.getDeleteLocalBranch.getData();
				utils.settings.getDeleteLocalBranch.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getDeleteLocalBranch.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getDeleteLocalBranch.invalidate();
			},
		});

	const handleDeleteBranchToggle = (enabled: boolean) => {
		setDeleteLocalBranch.mutate({ enabled });
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

				{showDeleteLocalBranch && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label
								htmlFor="delete-local-branch"
								className="text-sm font-medium"
							>
								Delete local branch on workspace removal
							</Label>
							<p className="text-xs text-muted-foreground">
								Also delete the local git branch when deleting a worktree
								workspace
							</p>
						</div>
						<Switch
							id="delete-local-branch"
							checked={deleteLocalBranch ?? false}
							onCheckedChange={handleDeleteBranchToggle}
							disabled={isDeleteBranchLoading || setDeleteLocalBranch.isPending}
						/>
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
			</div>
		</div>
	);
}
