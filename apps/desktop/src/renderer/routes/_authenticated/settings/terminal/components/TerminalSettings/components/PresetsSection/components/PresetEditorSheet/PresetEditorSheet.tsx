import type { ExecutionMode, TerminalPreset } from "@superset/local-db";
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
import type { PresetColumnKey } from "renderer/routes/_authenticated/settings/presets/types";
import { CommandsEditor } from "../../../PresetRow/components/CommandsEditor";
import type { AutoApplyField } from "../../constants";
import { LabelWithTooltip } from "../LabelWithTooltip";

interface PresetEditorSheetProps {
	preset: TerminalPreset | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDeletePreset: () => void;
	onFieldChange: (column: PresetColumnKey, value: string) => void;
	onFieldBlur: (column: PresetColumnKey) => void;
	onCommandsChange: (commands: string[]) => void;
	onCommandsBlur: () => void;
	onModeChange: (mode: ExecutionMode) => void;
	onToggleAutoApply: (field: AutoApplyField, enabled: boolean) => void;
	modeValue: ExecutionMode;
	hasMultipleCommands: boolean;
	isWorkspaceCreation: boolean;
	isNewTab: boolean;
}

export function PresetEditorSheet({
	preset,
	open,
	onOpenChange,
	onDeletePreset,
	onFieldChange,
	onFieldBlur,
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
								Configure commands and advanced launch options.
							</SheetDescription>
						</SheetHeader>

						<div className="flex-1 overflow-y-auto p-4 space-y-6">
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
									onChange={(e) => onFieldChange("description", e.target.value)}
									onBlur={() => onFieldBlur("description")}
									placeholder="e.g. Starts the dev server (optional)"
								/>
							</div>

							<div className="space-y-2">
								<LabelWithTooltip
									label="Directory"
									htmlFor="preset-directory"
									tooltip="Working directory for commands. Use a workspace-relative path like ./apps/web."
								/>
								<Input
									id="preset-directory"
									value={preset.cwd}
									onChange={(e) => onFieldChange("cwd", e.target.value)}
									onBlur={() => onFieldBlur("cwd")}
									placeholder="e.g. ./src (optional)"
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

							<div className="space-y-2">
								<LabelWithTooltip
									label="Launch Mode"
									tooltip="Controls whether commands open in the current tab, one new tab with panes, or one new tab per command."
								/>
								{hasMultipleCommands ? (
									<div className="rounded-md border border-border p-3">
										<RadioGroup
											value={modeValue}
											onValueChange={(value) =>
												onModeChange(value as ExecutionMode)
											}
											className="gap-3"
										>
											<div className="flex items-start gap-2">
												<RadioGroupItem
													id="preset-multi-command-split-pane"
													value="split-pane"
													className="mt-0.5"
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
													className="mt-0.5"
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
													className="mt-0.5"
												/>
												<Label
													htmlFor="preset-multi-command-new-tab-split-pane"
													className="text-sm font-medium"
												>
													Open all commands in a new tab using split panes
												</Label>
											</div>
										</RadioGroup>
									</div>
								) : (
									<Select
										value={singleCommandModeValue}
										onValueChange={(value) =>
											onModeChange(value as ExecutionMode)
										}
									>
										<SelectTrigger className="h-9 w-full">
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

							<div className="space-y-3 rounded-md border border-border p-3">
								<LabelWithTooltip
									label="Auto-run"
									className="text-sm font-medium"
									tooltip="Choose when this preset should run automatically."
								/>

								<div className="flex items-start gap-3">
									<Checkbox
										id="preset-workspace-autostart"
										checked={isWorkspaceCreation}
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

						<SheetFooter className="border-t p-4 sm:flex-row sm:items-center sm:justify-between">
							<Button
								type="button"
								variant="destructive"
								size="sm"
								onClick={onDeletePreset}
							>
								Delete Preset
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() => onOpenChange(false)}
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
