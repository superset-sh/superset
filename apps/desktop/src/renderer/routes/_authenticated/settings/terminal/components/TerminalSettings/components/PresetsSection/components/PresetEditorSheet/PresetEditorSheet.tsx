import type { ExecutionMode, TerminalPreset } from "@superset/local-db";
import { Alert, AlertDescription } from "@superset/ui/alert";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@superset/ui/sheet";
import { useMemo } from "react";
import { HiExclamationTriangle, HiOutlineFolderOpen } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { PresetColumnKey } from "renderer/routes/_authenticated/settings/presets/types";
import { useSettingsOriginRoute } from "renderer/stores/settings-state";
import {
	isAbsoluteFilesystemPath,
	toAbsoluteWorkspacePath,
	toRelativeWorkspacePath,
} from "shared/absolute-paths";
import { CommandsEditor } from "../../../PresetRow/components/CommandsEditor";
import type { AutoApplyField } from "../../constants";
import type { PresetProjectOption } from "../../preset-project-options";
import { LabelWithTooltip } from "../LabelWithTooltip";
import { ProjectTargetingField } from "./components/ProjectTargetingField";

interface PresetEditorSheetProps {
	preset: TerminalPreset | null;
	projects: PresetProjectOption[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDeletePreset: () => void;
	onFieldChange: (column: PresetColumnKey, value: string) => void;
	onFieldBlur: (column: PresetColumnKey) => void;
	onProjectIdsChange: (projectIds: string[] | null) => void;
	onDirectorySelect: (path: string) => void;
	onCommandsChange: (commands: string[]) => void;
	onCommandsBlur: () => void;
	onModeChange: (mode: ExecutionMode) => void;
	onToggleAutoApply: (field: AutoApplyField, enabled: boolean) => void;
	modeValue: ExecutionMode;
	hasMultipleCommands: boolean;
	isWorkspaceCreation: boolean;
	isNewTab: boolean;
}

function getWorkspaceIdFromRoute(route: string): string | null {
	const match = route.match(/\/workspace\/([^/]+)/);
	return match ? match[1] : null;
}

function toPresetDirectoryValue(
	workspacePath: string,
	selectedPath: string,
): string {
	const relativePath = toRelativeWorkspacePath(workspacePath, selectedPath);
	if (isAbsoluteFilesystemPath(relativePath)) {
		return selectedPath;
	}

	return relativePath === "." ? "." : `./${relativePath}`;
}

export function PresetEditorSheet({
	preset,
	projects,
	open,
	onOpenChange,
	onDeletePreset,
	onFieldChange,
	onFieldBlur,
	onProjectIdsChange,
	onDirectorySelect,
	onCommandsChange,
	onCommandsBlur,
	onModeChange,
	onToggleAutoApply,
	modeValue,
	hasMultipleCommands,
	isWorkspaceCreation,
	isNewTab,
}: PresetEditorSheetProps) {
	const singleCommandModeValue =
		modeValue === "split-pane" ? modeValue : "new-tab";
	const fieldClassName =
		"border-border/70 bg-transparent shadow-none dark:bg-transparent focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10";
	const neutralSelectionControlClassName =
		"border-border bg-transparent text-foreground shadow-none dark:bg-transparent data-[state=checked]:border-foreground data-[state=checked]:bg-transparent data-[state=checked]:text-foreground dark:data-[state=checked]:bg-transparent focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 [&_svg]:fill-current";
	const sectionHeadingClassName =
		"text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80";
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const originRoute = useSettingsOriginRoute();
	const trimmedCwd = preset?.cwd.trim() ?? "";
	const originWorkspaceId = useMemo(
		() => getWorkspaceIdFromRoute(originRoute),
		[originRoute],
	);
	const { data: originWorkspace } = electronTrpc.workspaces.get.useQuery(
		{ id: originWorkspaceId ?? "" },
		{ enabled: open && !!originWorkspaceId },
	);
	const isAbsolutePath = isAbsoluteFilesystemPath(trimmedCwd);
	const browseDefaultPath =
		(originWorkspace?.worktreePath && trimmedCwd
			? toAbsoluteWorkspacePath(originWorkspace.worktreePath, trimmedCwd)
			: undefined) ??
		(isAbsolutePath ? trimmedCwd : undefined) ??
		originWorkspace?.worktreePath ??
		undefined;
	const { data: directoryStatus } =
		electronTrpc.window.getDirectoryStatus.useQuery(
			{ path: trimmedCwd },
			{
				enabled: open && Boolean(trimmedCwd) && isAbsolutePath,
				staleTime: 5_000,
			},
		);

	const handleBrowseDirectory = async () => {
		const result = await selectDirectory.mutateAsync({
			title: "Select preset directory",
			defaultPath: browseDefaultPath,
		});

		if (!result.canceled && result.path) {
			if (originWorkspace?.worktreePath) {
				onDirectorySelect(
					toPresetDirectoryValue(originWorkspace.worktreePath, result.path),
				);
				return;
			}

			onDirectorySelect(result.path);
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="sm:max-w-xl w-full flex flex-col gap-0 p-0">
				{preset ? (
					<>
						<SheetHeader className="border-b pb-4">
							<SheetTitle className="text-sm font-medium">
								{preset.name.trim() || "Edit Preset"}
							</SheetTitle>
							<SheetDescription>
								Configure commands, targeting, and advanced launch options.
							</SheetDescription>
						</SheetHeader>

						<div className="flex-1 overflow-y-auto p-4 space-y-6">
							<div className="space-y-4">
								<div className="space-y-2">
									<LabelWithTooltip
										label="Name"
										htmlFor="preset-name"
										tooltip="The preset name shown in your presets list and launch surfaces."
									/>
									<Input
										id="preset-name"
										value={preset.name}
										onChange={(e) => onFieldChange("name", e.target.value)}
										onBlur={() => onFieldBlur("name")}
										className={fieldClassName}
										placeholder="e.g. Dev Server"
									/>
								</div>

								<div className="space-y-2">
									<LabelWithTooltip
										label="Description"
										htmlFor="preset-description"
										tooltip="Optional context to explain what this preset is for."
									/>
									<Input
										id="preset-description"
										value={preset.description ?? ""}
										onChange={(e) =>
											onFieldChange("description", e.target.value)
										}
										onBlur={() => onFieldBlur("description")}
										className={fieldClassName}
										placeholder="e.g. Starts the dev server (optional)"
									/>
								</div>

								<div className="space-y-2">
									<LabelWithTooltip
										label="Commands"
										tooltip="Each row is one command. Add multiple commands to run a grouped preset."
									/>
									<CommandsEditor
										commands={preset.commands}
										onChange={onCommandsChange}
										onBlur={onCommandsBlur}
										placeholder="e.g. bun run dev"
									/>
								</div>
							</div>

							<div className="space-y-4 border-t border-border/40 pt-5">
								<p className={sectionHeadingClassName}>Advanced</p>

								<div className="space-y-2">
									<LabelWithTooltip
										label="Applies To"
										tooltip="Choose whether this preset is available everywhere or only in specific projects."
									/>
									<ProjectTargetingField
										projectIds={preset.projectIds}
										projects={projects}
										preferredProjectId={originWorkspace?.projectId ?? null}
										onChange={onProjectIdsChange}
									/>
								</div>

								<div className="space-y-2">
									<LabelWithTooltip
										label="Directory"
										htmlFor="preset-directory"
										tooltip="Working directory for commands. Use a workspace-relative path like ./apps/web or choose an absolute folder."
									/>
									<div className="space-y-2">
										<div className="flex items-center gap-2">
											<Input
												id="preset-directory"
												value={preset.cwd}
												onChange={(e) => onFieldChange("cwd", e.target.value)}
												onBlur={() => onFieldBlur("cwd")}
												className={fieldClassName}
												placeholder="e.g. ./apps/web or /full/path (optional)"
											/>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={handleBrowseDirectory}
												disabled={selectDirectory.isPending}
												className="border-border/70 bg-transparent shadow-none hover:bg-accent/40 focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 dark:bg-transparent"
											>
												<HiOutlineFolderOpen className="size-4" />
												Browse
											</Button>
										</div>
										{trimmedCwd &&
										isAbsolutePath &&
										directoryStatus?.exists === false ? (
											<Alert variant="destructive">
												<HiExclamationTriangle />
												<AlertDescription>
													This directory does not exist. Launching the preset
													will fall back to the workspace root.
												</AlertDescription>
											</Alert>
										) : null}
										{trimmedCwd &&
										isAbsolutePath &&
										directoryStatus?.exists &&
										!directoryStatus.isDirectory ? (
											<Alert variant="destructive">
												<HiExclamationTriangle />
												<AlertDescription>
													This path exists, but it is not a directory.
												</AlertDescription>
											</Alert>
										) : null}
										{trimmedCwd && !isAbsolutePath ? (
											<p className="text-xs text-muted-foreground">
												Relative paths are resolved from each workspace root
												when the preset launches.
											</p>
										) : null}
									</div>
								</div>

								<div className="space-y-2">
									<LabelWithTooltip
										label="Launch Mode"
										tooltip="Controls whether commands open in the current tab, one new tab with panes, or one new tab per command."
									/>
									{hasMultipleCommands ? (
										<RadioGroup
											value={modeValue}
											onValueChange={(value) =>
												onModeChange(value as ExecutionMode)
											}
											className="gap-4 pt-1"
										>
											<div className="flex items-start gap-2">
												<RadioGroupItem
													id="preset-multi-command-split-pane"
													value="split-pane"
													className={`${neutralSelectionControlClassName} mt-0.5`}
												/>
												<Label
													htmlFor="preset-multi-command-split-pane"
													className="text-sm font-medium"
												>
													Open all commands in current tab using split panes
												</Label>
											</div>
											<div className="flex items-start gap-2">
												<RadioGroupItem
													id="preset-multi-command-new-tab"
													value="new-tab"
													className={`${neutralSelectionControlClassName} mt-0.5`}
												/>
												<Label
													htmlFor="preset-multi-command-new-tab"
													className="text-sm font-medium"
												>
													Open each command in its own new tab
												</Label>
											</div>
											<div className="flex items-start gap-2">
												<RadioGroupItem
													id="preset-multi-command-new-tab-split-pane"
													value="new-tab-split-pane"
													className={`${neutralSelectionControlClassName} mt-0.5`}
												/>
												<Label
													htmlFor="preset-multi-command-new-tab-split-pane"
													className="text-sm font-medium"
												>
													Open all commands in a new tab using split panes
												</Label>
											</div>
										</RadioGroup>
									) : (
										<Select
											value={singleCommandModeValue}
											onValueChange={(value) =>
												onModeChange(value as ExecutionMode)
											}
										>
											<SelectTrigger className={`h-9 w-full ${fieldClassName}`}>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="split-pane">
													Open in current tab
												</SelectItem>
												<SelectItem value="new-tab">Open in new tab</SelectItem>
											</SelectContent>
										</Select>
									)}
								</div>

								<div className="space-y-3">
									<LabelWithTooltip
										label="Auto-run"
										className="text-sm font-medium"
										tooltip="Choose when this preset should run automatically."
									/>

									<div className="space-y-4">
										<div className="flex items-start gap-3">
											<Checkbox
												id="preset-workspace-autostart"
												checked={isWorkspaceCreation}
												className={neutralSelectionControlClassName}
												onCheckedChange={(checked) =>
													onToggleAutoApply(
														"applyOnWorkspaceCreated",
														checked === true,
													)
												}
											/>
											<div className="space-y-0.5">
												<Label
													htmlFor="preset-workspace-autostart"
													className="text-sm font-medium"
												>
													When creating a workspace
												</Label>
												<p className="text-xs text-muted-foreground">
													Automatically launch this preset for new workspaces.
												</p>
											</div>
										</div>

										<div className="flex items-start gap-3">
											<Checkbox
												id="preset-tab-autostart"
												checked={isNewTab}
												className={neutralSelectionControlClassName}
												onCheckedChange={(checked) =>
													onToggleAutoApply("applyOnNewTab", checked === true)
												}
											/>
											<div className="space-y-0.5">
												<Label
													htmlFor="preset-tab-autostart"
													className="text-sm font-medium"
												>
													When opening a new tab
												</Label>
												<p className="text-xs text-muted-foreground">
													Automatically launch this preset for new tabs.
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>

						<SheetFooter className="border-t p-4 sm:flex-row sm:items-center sm:justify-between">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={onDeletePreset}
								className="text-destructive hover:bg-destructive/10 hover:text-destructive"
							>
								Delete Preset
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() => onOpenChange(false)}
								className="bg-foreground text-background hover:bg-foreground/90"
							>
								Done
							</Button>
						</SheetFooter>
					</>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
