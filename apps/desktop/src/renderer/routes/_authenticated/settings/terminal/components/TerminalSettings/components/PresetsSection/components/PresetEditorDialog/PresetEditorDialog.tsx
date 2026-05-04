import type { ExecutionMode, TerminalPreset } from "@superset/local-db";
import { Alert, AlertDescription } from "@superset/ui/alert";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
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
import { Trash2 } from "lucide-react";
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
import { ProjectTargetingField } from "./components/ProjectTargetingField";

interface PresetEditorDialogProps {
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

interface FieldProps {
	label: string;
	htmlFor?: string;
	hint?: React.ReactNode;
	children: React.ReactNode;
}

function Field({ label, htmlFor, hint, children }: FieldProps) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={htmlFor} className="text-sm font-medium">
				{label}
			</Label>
			{children}
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}

export function PresetEditorDialog({
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
}: PresetEditorDialogProps) {
	const singleCommandModeValue =
		modeValue === "split-pane" ? modeValue : "new-tab";
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
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
				{preset ? (
					<>
						<DialogHeader>
							<DialogTitle>{preset.name.trim() || "Edit preset"}</DialogTitle>
						</DialogHeader>

						<div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
							<div className="space-y-5">
								<Field label="Name" htmlFor="preset-name">
									<Input
										id="preset-name"
										value={preset.name}
										onChange={(e) => onFieldChange("name", e.target.value)}
										onBlur={() => onFieldBlur("name")}
										placeholder="e.g. Dev server"
									/>
								</Field>

								<Field label="Description" htmlFor="preset-description">
									<Input
										id="preset-description"
										value={preset.description ?? ""}
										onChange={(e) =>
											onFieldChange("description", e.target.value)
										}
										onBlur={() => onFieldBlur("description")}
										placeholder="Optional"
									/>
								</Field>

								<Field
									label="Commands"
									hint="One command per row. Add multiple to launch a grouped preset."
								>
									<CommandsEditor
										commands={preset.commands}
										onChange={onCommandsChange}
										onBlur={onCommandsBlur}
										placeholder="e.g. bun run dev"
									/>
								</Field>
							</div>

							<div className="space-y-5">
								<Field label="Applies to">
									<ProjectTargetingField
										projectIds={preset.projectIds}
										projects={projects}
										preferredProjectId={originWorkspace?.projectId ?? null}
										onChange={onProjectIdsChange}
									/>
								</Field>

								<Field
									label="Directory"
									htmlFor="preset-directory"
									hint={
										<>
											Use <code>./apps/web</code> for a workspace-relative path,
											or pick an absolute folder.
										</>
									}
								>
									<div className="flex items-center gap-2">
										<Input
											id="preset-directory"
											value={preset.cwd}
											onChange={(e) => onFieldChange("cwd", e.target.value)}
											onBlur={() => onFieldBlur("cwd")}
											placeholder="e.g. ./apps/web"
										/>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={handleBrowseDirectory}
											disabled={selectDirectory.isPending}
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
												This directory does not exist. The preset will fall back
												to the workspace root.
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
								</Field>

								<Field label="Launch mode">
									{hasMultipleCommands ? (
										<RadioGroup
											value={modeValue}
											onValueChange={(value) =>
												onModeChange(value as ExecutionMode)
											}
											className="gap-2"
										>
											<div className="flex items-start gap-2">
												<RadioGroupItem
													id="preset-multi-command-split-pane"
													value="split-pane"
													className="mt-0.5"
												/>
												<Label
													htmlFor="preset-multi-command-split-pane"
													className="text-sm font-normal"
												>
													All in current tab (split panes)
												</Label>
											</div>
											<div className="flex items-start gap-2">
												<RadioGroupItem
													id="preset-multi-command-new-tab"
													value="new-tab"
													className="mt-0.5"
												/>
												<Label
													htmlFor="preset-multi-command-new-tab"
													className="text-sm font-normal"
												>
													Each in its own new tab
												</Label>
											</div>
											<div className="flex items-start gap-2">
												<RadioGroupItem
													id="preset-multi-command-new-tab-split-pane"
													value="new-tab-split-pane"
													className="mt-0.5"
												/>
												<Label
													htmlFor="preset-multi-command-new-tab-split-pane"
													className="text-sm font-normal"
												>
													All in a new tab (split panes)
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
											<SelectTrigger className="w-full">
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
								</Field>

								<Field
									label="Auto-run"
									hint="Launch automatically in these situations."
								>
									<div className="space-y-2 pt-0.5">
										<div className="flex items-start gap-2.5">
											<Checkbox
												id="preset-workspace-autostart"
												checked={isWorkspaceCreation}
												className="mt-0.5"
												onCheckedChange={(checked) =>
													onToggleAutoApply(
														"applyOnWorkspaceCreated",
														checked === true,
													)
												}
											/>
											<Label
												htmlFor="preset-workspace-autostart"
												className="text-sm font-normal"
											>
												When creating a workspace
											</Label>
										</div>
										<div className="flex items-start gap-2.5">
											<Checkbox
												id="preset-tab-autostart"
												checked={isNewTab}
												className="mt-0.5"
												onCheckedChange={(checked) =>
													onToggleAutoApply("applyOnNewTab", checked === true)
												}
											/>
											<Label
												htmlFor="preset-tab-autostart"
												className="text-sm font-normal"
											>
												When opening a new tab
											</Label>
										</div>
									</div>
								</Field>
							</div>
						</div>

						<DialogFooter className="sm:justify-between">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={onDeletePreset}
								className="text-destructive hover:bg-destructive/10 hover:text-destructive"
							>
								<Trash2 className="size-4" />
								Delete preset
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() => onOpenChange(false)}
							>
								Done
							</Button>
						</DialogFooter>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
