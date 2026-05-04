import type { ExecutionMode, TerminalPreset } from "@superset/local-db";
import { Alert, AlertDescription } from "@superset/ui/alert";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
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

interface SettingsRowProps {
	label: string;
	hint?: React.ReactNode;
	htmlFor?: string;
	children: React.ReactNode;
}

function SettingsRow({ label, hint, htmlFor, children }: SettingsRowProps) {
	return (
		<div className="flex items-center justify-between gap-6 p-4">
			<div className="min-w-0 flex-1">
				<Label htmlFor={htmlFor} className="text-sm font-medium">
					{label}
				</Label>
				{hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
			</div>
			<div className="shrink-0">{children}</div>
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

	const launchModeOptions = hasMultipleCommands
		? [
				{ value: "split-pane", label: "All in current tab (split panes)" },
				{ value: "new-tab", label: "Each in its own new tab" },
				{
					value: "new-tab-split-pane",
					label: "All in a new tab (split panes)",
				},
			]
		: [
				{ value: "split-pane", label: "Open in current tab" },
				{ value: "new-tab", label: "Open in new tab" },
			];
	const launchModeValue = hasMultipleCommands
		? modeValue
		: modeValue === "split-pane"
			? "split-pane"
			: "new-tab";

	const directoryAlert =
		trimmedCwd && isAbsolutePath && directoryStatus?.exists === false ? (
			<Alert variant="destructive">
				<HiExclamationTriangle />
				<AlertDescription>
					This directory does not exist. The preset will fall back to the
					workspace root.
				</AlertDescription>
			</Alert>
		) : trimmedCwd &&
			isAbsolutePath &&
			directoryStatus?.exists &&
			!directoryStatus.isDirectory ? (
			<Alert variant="destructive">
				<HiExclamationTriangle />
				<AlertDescription>
					This path exists, but it is not a directory.
				</AlertDescription>
			</Alert>
		) : null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
				{preset ? (
					<>
						<DialogHeader>
							<DialogTitle>{preset.name.trim() || "Edit preset"}</DialogTitle>
						</DialogHeader>

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
									onChange={(e) => onFieldChange("description", e.target.value)}
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

							<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
								<div className="p-4 space-y-3">
									<Label className="text-sm font-medium">Applies to</Label>
									<ProjectTargetingField
										projectIds={preset.projectIds}
										projects={projects}
										preferredProjectId={originWorkspace?.projectId ?? null}
										onChange={onProjectIdsChange}
									/>
								</div>

								<SettingsRow
									label="Directory"
									htmlFor="preset-directory"
									hint="Working directory for the preset. Use a workspace-relative path or pick an absolute folder."
								>
									<div className="flex items-center gap-2">
										<Input
											id="preset-directory"
											value={preset.cwd}
											onChange={(e) => onFieldChange("cwd", e.target.value)}
											onBlur={() => onFieldBlur("cwd")}
											placeholder="./apps/web"
											className="w-56"
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
								</SettingsRow>

								{directoryAlert && (
									<div className="px-4 pb-4">{directoryAlert}</div>
								)}

								<SettingsRow
									label="Launch mode"
									hint={
										hasMultipleCommands
											? "How grouped commands open."
											: "How the command opens."
									}
								>
									<Select
										value={launchModeValue}
										onValueChange={(value) =>
											onModeChange(value as ExecutionMode)
										}
									>
										<SelectTrigger size="sm" className="w-64">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{launchModeOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</SettingsRow>

								<SettingsRow
									label="Auto-run on workspace creation"
									htmlFor="preset-workspace-autostart"
									hint="Launch this preset when a new workspace is created."
								>
									<Switch
										id="preset-workspace-autostart"
										checked={isWorkspaceCreation}
										onCheckedChange={(checked) =>
											onToggleAutoApply("applyOnWorkspaceCreated", checked)
										}
									/>
								</SettingsRow>

								<SettingsRow
									label="Auto-run on new tab"
									htmlFor="preset-tab-autostart"
									hint="Launch this preset whenever a new terminal tab opens."
								>
									<Switch
										id="preset-tab-autostart"
										checked={isNewTab}
										onCheckedChange={(checked) =>
											onToggleAutoApply("applyOnNewTab", checked)
										}
									/>
								</SettingsRow>
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
