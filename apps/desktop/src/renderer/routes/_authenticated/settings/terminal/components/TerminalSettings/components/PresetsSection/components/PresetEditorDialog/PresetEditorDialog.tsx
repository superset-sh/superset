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

interface DialogRowProps {
	label: string;
	hint?: React.ReactNode;
	htmlFor?: string;
	stacked?: boolean;
	children: React.ReactNode;
}

function DialogRow({
	label,
	hint,
	htmlFor,
	stacked,
	children,
}: DialogRowProps) {
	if (stacked) {
		return (
			<div className="py-2.5 space-y-2">
				<div className="space-y-0.5">
					<Label htmlFor={htmlFor} className="text-sm font-medium">
						{label}
					</Label>
					{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
				</div>
				{children}
			</div>
		);
	}
	return (
		<div className="flex items-start justify-between gap-6 py-2.5">
			<div className="min-w-0 flex-1">
				<Label htmlFor={htmlFor} className="text-sm font-medium">
					{label}
				</Label>
				{hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
			</div>
			<div className="w-72 shrink-0">{children}</div>
		</div>
	);
}

interface SegmentedOption<T extends string> {
	value: T;
	label: string;
}

interface SegmentedProps<T extends string> {
	value: T;
	onChange: (value: T) => void;
	options: SegmentedOption<T>[];
	className?: string;
}

function Segmented<T extends string>({
	value,
	onChange,
	options,
	className,
}: SegmentedProps<T>) {
	return (
		<div
			className={`inline-flex rounded-md border border-border overflow-hidden w-full ${className ?? ""}`.trim()}
		>
			{options.map((option, idx) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					className={`flex-1 px-3 py-1 text-xs font-medium transition-colors ${
						idx > 0 ? "border-l border-border" : ""
					} ${
						value === option.value
							? "bg-accent text-accent-foreground"
							: "bg-transparent text-muted-foreground hover:bg-accent/50"
					}`}
				>
					{option.label}
				</button>
			))}
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

						<div className="space-y-3">
							<DialogRow label="Name" htmlFor="preset-name">
								<Input
									id="preset-name"
									value={preset.name}
									onChange={(e) => onFieldChange("name", e.target.value)}
									onBlur={() => onFieldBlur("name")}
									placeholder="e.g. Dev server"
								/>
							</DialogRow>

							<DialogRow
								label="Description"
								htmlFor="preset-description"
								hint="Optional context shown in the presets list."
							>
								<Input
									id="preset-description"
									value={preset.description ?? ""}
									onChange={(e) => onFieldChange("description", e.target.value)}
									onBlur={() => onFieldBlur("description")}
									placeholder="Optional"
								/>
							</DialogRow>

							<DialogRow
								label="Commands"
								hint="One command per row. Add multiple to launch a grouped preset."
								stacked
							>
								<CommandsEditor
									commands={preset.commands}
									onChange={onCommandsChange}
									onBlur={onCommandsBlur}
									placeholder="e.g. bun run dev"
								/>
							</DialogRow>

							<DialogRow
								label="Applies to"
								hint="Where this preset is available."
							>
								<ProjectTargetingField
									projectIds={preset.projectIds}
									projects={projects}
									preferredProjectId={originWorkspace?.projectId ?? null}
									onChange={onProjectIdsChange}
								/>
							</DialogRow>

							<DialogRow
								label="Directory"
								htmlFor="preset-directory"
								hint="Use a workspace-relative path or an absolute folder."
							>
								<div className="flex items-center gap-2">
									<Input
										id="preset-directory"
										value={preset.cwd}
										onChange={(e) => onFieldChange("cwd", e.target.value)}
										onBlur={() => onFieldBlur("cwd")}
										placeholder="./apps/web"
										className="flex-1"
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleBrowseDirectory}
										disabled={selectDirectory.isPending}
										aria-label="Browse for directory"
									>
										<HiOutlineFolderOpen className="size-4" />
									</Button>
								</div>
							</DialogRow>

							{directoryAlert && (
								<div className="px-4 pb-4">{directoryAlert}</div>
							)}

							<DialogRow
								label="Launch mode"
								hint={
									hasMultipleCommands
										? "How grouped commands open."
										: "How the command opens."
								}
							>
								{hasMultipleCommands ? (
									<Select
										value={launchModeValue}
										onValueChange={(value) =>
											onModeChange(value as ExecutionMode)
										}
									>
										<SelectTrigger size="sm" className="w-full">
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
								) : (
									<Segmented
										value={launchModeValue}
										onChange={(value) => onModeChange(value as ExecutionMode)}
										options={[
											{ value: "split-pane", label: "Current tab" },
											{ value: "new-tab", label: "New tab" },
										]}
									/>
								)}
							</DialogRow>

							<DialogRow
								label="Auto-run on workspace creation"
								htmlFor="preset-workspace-autostart"
								hint="Launch this preset when a new workspace is created."
							>
								<div className="flex justify-end">
									<Switch
										id="preset-workspace-autostart"
										checked={isWorkspaceCreation}
										onCheckedChange={(checked) =>
											onToggleAutoApply("applyOnWorkspaceCreated", checked)
										}
									/>
								</div>
							</DialogRow>

							<DialogRow
								label="Auto-run on new tab"
								htmlFor="preset-tab-autostart"
								hint="Launch this preset whenever a new terminal tab opens."
							>
								<div className="flex justify-end">
									<Switch
										id="preset-tab-autostart"
										checked={isNewTab}
										onCheckedChange={(checked) =>
											onToggleAutoApply("applyOnNewTab", checked)
										}
									/>
								</div>
							</DialogRow>
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
