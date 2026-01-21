import type { TerminalLinkBehavior, TerminalPreset } from "@superset/local-db";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineCheck, HiOutlinePlus } from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { markTerminalKilledByUser } from "renderer/lib/terminal-kill-tracking";
import { usePresets } from "renderer/react-query/presets";
import {
	PRESET_COLUMNS,
	type PresetColumnKey,
} from "renderer/routes/_authenticated/settings/presets/types";
import { DEFAULT_TERMINAL_PERSISTENCE } from "shared/constants";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { PresetRow } from "./components/PresetRow";

interface PresetTemplate {
	name: string;
	preset: {
		name: string;
		description: string;
		cwd: string;
		commands: string[];
	};
}

const PRESET_TEMPLATES: PresetTemplate[] = [
	{
		name: "codex",
		preset: {
			name: "codex",
			description: "Danger mode: All permissions auto-approved",
			cwd: "",
			commands: [
				'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
			],
		},
	},
	{
		name: "claude",
		preset: {
			name: "claude",
			description: "Danger mode: All permissions auto-approved",
			cwd: "",
			commands: ["claude --dangerously-skip-permissions"],
		},
	},
	{
		name: "gemini",
		preset: {
			name: "gemini",
			description: "Danger mode: All permissions auto-approved",
			cwd: "",
			commands: ["gemini --yolo"],
		},
	},
	{
		name: "cursor-agent",
		preset: {
			name: "cursor-agent",
			description: "Cursor AI agent for terminal-based coding assistance",
			cwd: "",
			commands: ["cursor-agent"],
		},
	},
	{
		name: "opencode",
		preset: {
			name: "opencode",
			description: "OpenCode: Open source AI coding agent",
			cwd: "",
			commands: ["opencode"],
		},
	},
];

interface TerminalSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function TerminalSettings({ visibleItems }: TerminalSettingsProps) {
	const showPresets = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_PRESETS,
		visibleItems,
	);
	const showQuickAdd = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_QUICK_ADD,
		visibleItems,
	);
	const showPersistence = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_PERSISTENCE,
		visibleItems,
	);
	const showSessions = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_SESSIONS,
		visibleItems,
	);
	const showLinkBehavior = isItemVisible(
		SETTING_ITEM_ID.TERMINAL_LINK_BEHAVIOR,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();
	const isDark = useIsDarkTheme();

	// Presets
	const {
		presets: serverPresets,
		isLoading: isLoadingPresets,
		createPreset,
		updatePreset,
		deletePreset,
		setDefaultPreset,
	} = usePresets();
	const [localPresets, setLocalPresets] =
		useState<TerminalPreset[]>(serverPresets);
	const presetsContainerRef = useRef<HTMLDivElement>(null);
	const prevPresetsCountRef = useRef(serverPresets.length);

	useEffect(() => {
		setLocalPresets(serverPresets);

		if (serverPresets.length > prevPresetsCountRef.current) {
			requestAnimationFrame(() => {
				presetsContainerRef.current?.scrollTo({
					top: presetsContainerRef.current.scrollHeight,
					behavior: "smooth",
				});
			});
		}
		prevPresetsCountRef.current = serverPresets.length;
	}, [serverPresets]);

	const existingPresetNames = useMemo(
		() => new Set(serverPresets.map((p) => p.name)),
		[serverPresets],
	);

	const isTemplateAdded = (template: PresetTemplate) =>
		existingPresetNames.has(template.preset.name);

	const handleCellChange = (
		rowIndex: number,
		column: PresetColumnKey,
		value: string,
	) => {
		setLocalPresets((prev) =>
			prev.map((p, i) => (i === rowIndex ? { ...p, [column]: value } : p)),
		);
	};

	const handleCellBlur = (rowIndex: number, column: PresetColumnKey) => {
		const preset = localPresets[rowIndex];
		const serverPreset = serverPresets[rowIndex];
		if (!preset || !serverPreset) return;
		if (preset[column] === serverPreset[column]) return;

		updatePreset.mutate({
			id: preset.id,
			patch: { [column]: preset[column] },
		});
	};

	const handleCommandsChange = (rowIndex: number, commands: string[]) => {
		const preset = localPresets[rowIndex];
		const isDelete = preset && commands.length < preset.commands.length;

		setLocalPresets((prev) =>
			prev.map((p, i) => (i === rowIndex ? { ...p, commands } : p)),
		);

		// Save immediately on delete since onBlur won't have the updated state yet
		if (isDelete) {
			updatePreset.mutate({
				id: preset.id,
				patch: { commands },
			});
		}
	};

	const handleCommandsBlur = (rowIndex: number) => {
		const preset = localPresets[rowIndex];
		const serverPreset = serverPresets[rowIndex];
		if (!preset || !serverPreset) return;
		if (
			JSON.stringify(preset.commands) === JSON.stringify(serverPreset.commands)
		)
			return;

		updatePreset.mutate({
			id: preset.id,
			patch: { commands: preset.commands },
		});
	};

	const handleAddRow = () => {
		createPreset.mutate({
			name: "",
			cwd: "",
			commands: [""],
		});
	};

	const handleAddTemplate = (template: PresetTemplate) => {
		if (isTemplateAdded(template)) return;
		createPreset.mutate(template.preset);
	};

	const handleDeleteRow = (rowIndex: number) => {
		const preset = localPresets[rowIndex];
		if (!preset) return;

		deletePreset.mutate({ id: preset.id });
	};

	const handleSetDefault = (presetId: string | null) => {
		setDefaultPreset.mutate({ id: presetId });
	};
	const { data: terminalPersistence, isLoading } =
		electronTrpc.settings.getTerminalPersistence.useQuery();

	const { data: daemonSessions } =
		electronTrpc.terminal.listDaemonSessions.useQuery();
	const daemonModeEnabled = daemonSessions?.daemonModeEnabled ?? false;
	const sessions = daemonSessions?.sessions ?? [];
	const aliveSessions = useMemo(
		() => sessions.filter((session) => session.isAlive),
		[sessions],
	);
	const sessionsSorted = useMemo(() => {
		return [...aliveSessions].sort((a, b) => {
			// Attached sessions first, then newest attach time.
			if (a.attachedClients !== b.attachedClients) {
				return b.attachedClients - a.attachedClients;
			}
			const aTime = a.lastAttachedAt ? Date.parse(a.lastAttachedAt) : 0;
			const bTime = b.lastAttachedAt ? Date.parse(b.lastAttachedAt) : 0;
			return bTime - aTime;
		});
	}, [aliveSessions]);

	const [confirmKillAllOpen, setConfirmKillAllOpen] = useState(false);
	const [confirmClearHistoryOpen, setConfirmClearHistoryOpen] = useState(false);
	const [confirmRestartDaemonOpen, setConfirmRestartDaemonOpen] =
		useState(false);
	const [showSessionList, setShowSessionList] = useState(false);
	const [pendingKillSession, setPendingKillSession] = useState<{
		sessionId: string;
		workspaceId: string;
	} | null>(null);

	const setTerminalPersistence =
		electronTrpc.settings.setTerminalPersistence.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getTerminalPersistence.cancel();
				const previous = utils.settings.getTerminalPersistence.getData();
				utils.settings.getTerminalPersistence.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getTerminalPersistence.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getTerminalPersistence.invalidate();
			},
		});

	const handleToggle = (enabled: boolean) => {
		setTerminalPersistence.mutate({ enabled });
	};

	// Terminal link behavior setting
	const { data: terminalLinkBehavior, isLoading: isLoadingLinkBehavior } =
		electronTrpc.settings.getTerminalLinkBehavior.useQuery();

	const setTerminalLinkBehavior =
		electronTrpc.settings.setTerminalLinkBehavior.useMutation({
			onMutate: async ({ behavior }) => {
				await utils.settings.getTerminalLinkBehavior.cancel();
				const previous = utils.settings.getTerminalLinkBehavior.getData();
				utils.settings.getTerminalLinkBehavior.setData(undefined, behavior);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getTerminalLinkBehavior.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getTerminalLinkBehavior.invalidate();
			},
		});

	const handleLinkBehaviorChange = (value: string) => {
		setTerminalLinkBehavior.mutate({
			behavior: value as TerminalLinkBehavior,
		});
	};

	const killAllDaemonSessions =
		electronTrpc.terminal.killAllDaemonSessions.useMutation({
			onMutate: async () => {
				await utils.terminal.listDaemonSessions.cancel();
				const previous = utils.terminal.listDaemonSessions.getData();
				utils.terminal.listDaemonSessions.setData(undefined, {
					daemonModeEnabled: true,
					sessions: [],
				});
				return { previous };
			},
			onSuccess: (result) => {
				if (result.daemonModeEnabled) {
					if (result.remainingCount > 0) {
						toast.warning("Some sessions could not be killed", {
							description: `${result.killedCount} terminated, ${result.remainingCount} remaining`,
						});
					} else {
						toast.success("Killed all terminal sessions", {
							description: `${result.killedCount} sessions terminated`,
						});
					}
				} else {
					toast.error("Terminal persistence is not active", {
						description: "Restart the app after enabling terminal persistence.",
					});
				}
			},
			onError: (error, _vars, context) => {
				if (context?.previous) {
					utils.terminal.listDaemonSessions.setData(
						undefined,
						context.previous,
					);
				}
				toast.error("Failed to kill sessions", {
					description: error.message,
				});
			},
			onSettled: () => {
				setTimeout(() => {
					utils.terminal.listDaemonSessions.invalidate();
				}, 300);
			},
		});

	const clearTerminalHistory =
		electronTrpc.terminal.clearTerminalHistory.useMutation({
			onSuccess: () => {
				toast.success("Cleared terminal history");
				utils.terminal.listDaemonSessions.invalidate();
			},
			onError: (error) => {
				toast.error("Failed to clear terminal history", {
					description: error.message,
				});
			},
		});

	const killDaemonSession = electronTrpc.terminal.kill.useMutation({
		onSuccess: () => {
			toast.success("Killed terminal session");
			utils.terminal.listDaemonSessions.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to kill session", {
				description: error.message,
			});
		},
	});

	const restartDaemon = electronTrpc.terminal.restartDaemon.useMutation({
		onSuccess: () => {
			toast.success("Daemon restarted", {
				description:
					"Terminal daemon has been restarted. Open a terminal to spawn a fresh daemon.",
			});
			utils.terminal.listDaemonSessions.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to restart daemon", {
				description: error.message,
			});
		},
	});

	const formatTimestamp = (value?: string) => {
		if (!value) return "—";
		return value.replace("T", " ").replace(/\.\d+Z$/, "Z");
	};

	return (
		<div className="p-6 max-w-6xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Terminal</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure terminal behavior, presets, and persistence
				</p>
			</div>

			<div className="space-y-6">
				{/* Presets Section */}
				{(showPresets || showQuickAdd) && (
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label className="text-sm font-medium">Terminal Presets</Label>
								<p className="text-xs text-muted-foreground">
									Presets let you quickly launch terminals with pre-configured
									commands.
								</p>
							</div>
							{showPresets && (
								<Button
									variant="default"
									size="sm"
									className="gap-2"
									onClick={handleAddRow}
								>
									<HiOutlinePlus className="h-4 w-4" />
									Add Preset
								</Button>
							)}
						</div>

						{showQuickAdd && (
							<div className="flex flex-wrap gap-2">
								<span className="text-xs text-muted-foreground mr-1 self-center">
									Quick add:
								</span>
								{PRESET_TEMPLATES.map((template) => {
									const alreadyAdded = isTemplateAdded(template);
									const presetIcon = getPresetIcon(template.name, isDark);
									return (
										<Tooltip key={template.name}>
											<TooltipTrigger asChild>
												<Button
													variant="outline"
													size="sm"
													className="gap-1.5 text-xs h-7"
													onClick={() => handleAddTemplate(template)}
													disabled={alreadyAdded || createPreset.isPending}
												>
													{alreadyAdded ? (
														<HiOutlineCheck className="h-3 w-3" />
													) : presetIcon ? (
														<img
															src={presetIcon}
															alt=""
															className="h-3 w-3 object-contain"
														/>
													) : null}
													{template.name}
												</Button>
											</TooltipTrigger>
											<TooltipContent side="bottom" showArrow={false}>
												{alreadyAdded
													? "Already added"
													: template.preset.description}
											</TooltipContent>
										</Tooltip>
									);
								})}
							</div>
						)}

						{showPresets && (
							<div className="rounded-lg border border-border overflow-hidden">
								<div className="flex items-center gap-4 py-2 px-4 bg-accent/10 border-b border-border">
									{PRESET_COLUMNS.map((column) => (
										<div
											key={column.key}
											className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wider"
										>
											{column.label}
										</div>
									))}
									<div className="w-20 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center shrink-0">
										Actions
									</div>
								</div>

								<div
									ref={presetsContainerRef}
									className="max-h-[320px] overflow-y-auto"
								>
									{isLoadingPresets ? (
										<div className="py-8 text-center text-sm text-muted-foreground">
											Loading presets...
										</div>
									) : localPresets.length > 0 ? (
										localPresets.map((preset, index) => (
											<PresetRow
												key={preset.id}
												preset={preset}
												rowIndex={index}
												isEven={index % 2 === 0}
												onChange={handleCellChange}
												onBlur={handleCellBlur}
												onCommandsChange={handleCommandsChange}
												onCommandsBlur={handleCommandsBlur}
												onDelete={handleDeleteRow}
												onSetDefault={handleSetDefault}
											/>
										))
									) : (
										<div className="py-8 text-center text-sm text-muted-foreground">
											No presets yet. Click "Add Preset" to create your first
											preset.
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				)}

				{showPersistence && (
					<div
						className={
							showPresets || showQuickAdd
								? "flex items-center justify-between pt-6 border-t"
								: "flex items-center justify-between"
						}
					>
						<div className="space-y-0.5">
							<Label
								htmlFor="terminal-persistence"
								className="text-sm font-medium"
							>
								Terminal persistence
							</Label>
							<p className="text-xs text-muted-foreground">
								Keep terminal sessions alive across app restarts and workspace
								switches. TUI apps like Claude Code will resume exactly where
								you left off.
							</p>
							<p className="text-xs text-muted-foreground/70 mt-1">
								May use more memory with many terminals open. Disable if you
								notice performance issues.
							</p>
							<p className="text-xs text-muted-foreground/70 mt-1">
								Requires app restart to take effect.
							</p>
						</div>
						<Switch
							id="terminal-persistence"
							checked={terminalPersistence ?? DEFAULT_TERMINAL_PERSISTENCE}
							onCheckedChange={handleToggle}
							disabled={isLoading || setTerminalPersistence.isPending}
						/>
					</div>
				)}

				{showLinkBehavior && (
					<div
						className={
							showPersistence || showPresets || showQuickAdd
								? "flex items-center justify-between pt-6 border-t"
								: "flex items-center justify-between"
						}
					>
						<div className="space-y-0.5">
							<Label
								htmlFor="terminal-link-behavior"
								className="text-sm font-medium"
							>
								Terminal file links
							</Label>
							<p className="text-xs text-muted-foreground">
								Choose how to open file paths when Cmd+clicking in the terminal
							</p>
						</div>
						<Select
							value={terminalLinkBehavior ?? "external-editor"}
							onValueChange={handleLinkBehaviorChange}
							disabled={
								isLoadingLinkBehavior || setTerminalLinkBehavior.isPending
							}
						>
							<SelectTrigger className="w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="external-editor">External editor</SelectItem>
								<SelectItem value="file-viewer">File viewer</SelectItem>
							</SelectContent>
						</Select>
					</div>
				)}

				{showSessions && (
					<div
						className={
							showPersistence || showLinkBehavior
								? "rounded-md border border-border/60 p-4 space-y-3"
								: "rounded-md border border-border/60 p-4 space-y-3"
						}
					>
						<div className="space-y-0.5">
							<div className="flex items-center justify-between">
								<Label className="text-sm font-medium">Manage sessions</Label>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => utils.terminal.listDaemonSessions.invalidate()}
								>
									Refresh
								</Button>
							</div>
							{daemonModeEnabled ? (
								<>
									<p className="text-xs text-muted-foreground">
										Daemon sessions running: {aliveSessions.length}
									</p>
									{aliveSessions.length >= 20 && (
										<p className="text-xs text-muted-foreground/70">
											Large numbers of persistent terminals can increase
											CPU/memory usage. Consider killing old sessions if you
											notice slowdowns.
										</p>
									)}
								</>
							) : (
								<p className="text-xs text-muted-foreground">
									Enable terminal persistence and restart the app to manage
									daemon sessions.
								</p>
							)}
						</div>

						<div className="flex flex-wrap gap-2">
							<Button
								variant="destructive"
								size="sm"
								disabled={
									!daemonModeEnabled ||
									aliveSessions.length === 0 ||
									killAllDaemonSessions.isPending
								}
								onClick={() => setConfirmKillAllOpen(true)}
							>
								Kill all sessions
							</Button>
							<Button
								variant="secondary"
								size="sm"
								disabled={
									!daemonModeEnabled ||
									aliveSessions.length === 0 ||
									clearTerminalHistory.isPending
								}
								onClick={() => setConfirmClearHistoryOpen(true)}
							>
								Clear terminal history
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={!daemonModeEnabled || restartDaemon.isPending}
								onClick={() => setConfirmRestartDaemonOpen(true)}
							>
								Restart daemon
							</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={!daemonModeEnabled || aliveSessions.length === 0}
								onClick={() => setShowSessionList((v) => !v)}
							>
								{showSessionList ? "Hide sessions" : "Show sessions"}
							</Button>
						</div>

						{daemonModeEnabled &&
							showSessionList &&
							aliveSessions.length > 0 && (
								<div className="rounded-md border border-border/60 overflow-hidden">
									<div className="max-h-64 overflow-auto">
										<table className="w-full text-xs">
											<thead className="sticky top-0 bg-background">
												<tr className="text-muted-foreground">
													<th className="px-2 py-2 text-left font-medium">
														Workspace
													</th>
													<th className="px-2 py-2 text-left font-medium">
														Session
													</th>
													<th className="px-2 py-2 text-right font-medium">
														Clients
													</th>
													<th className="px-2 py-2 text-right font-medium">
														PID
													</th>
													<th className="px-2 py-2 text-left font-medium">
														Last attached
													</th>
													<th className="px-2 py-2 text-right font-medium">
														Action
													</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-border/60">
												{sessionsSorted.map((session) => (
													<tr
														key={session.sessionId}
														className="hover:bg-muted/30"
													>
														<td className="px-2 py-2 font-mono">
															{session.workspaceId}
														</td>
														<td className="px-2 py-2 font-mono">
															{session.sessionId}
														</td>
														<td className="px-2 py-2 text-right">
															{session.attachedClients}
														</td>
														<td className="px-2 py-2 text-right font-mono">
															{session.pid ?? "—"}
														</td>
														<td className="px-2 py-2">
															{formatTimestamp(session.lastAttachedAt)}
														</td>
														<td className="px-2 py-2 text-right">
															<Button
																variant="ghost"
																size="sm"
																onClick={() =>
																	setPendingKillSession({
																		sessionId: session.sessionId,
																		workspaceId: session.workspaceId,
																	})
																}
															>
																Kill
															</Button>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							)}
					</div>
				)}
			</div>

			<AlertDialog
				open={confirmKillAllOpen}
				onOpenChange={setConfirmKillAllOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Kill all terminal sessions?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									This will terminate all persistent terminal processes (builds,
									tests, agents, etc.).
								</span>
								<span className="block">
									You can't undo this action. Terminal panes will show "Process
									exited" and can be restarted.
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmKillAllOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							disabled={killAllDaemonSessions.isPending}
							onClick={() => {
								setConfirmKillAllOpen(false);
								for (const session of sessions) {
									markTerminalKilledByUser(session.sessionId);
								}
								killAllDaemonSessions.mutate();
							}}
						>
							Kill all
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={confirmClearHistoryOpen}
				onOpenChange={setConfirmClearHistoryOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Clear terminal history?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									This deletes the saved scrollback used for reboot/crash
									recovery.
								</span>
								<span className="block">
									Running terminal processes continue, but older output may no
									longer be available after restarting the app.
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmClearHistoryOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="secondary"
							size="sm"
							disabled={clearTerminalHistory.isPending}
							onClick={() => {
								setConfirmClearHistoryOpen(false);
								clearTerminalHistory.mutate();
							}}
						>
							Clear history
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={!!pendingKillSession}
				onOpenChange={(open) => {
					if (!open) setPendingKillSession(null);
				}}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Kill terminal session?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									This will terminate the session and its underlying process.
								</span>
								{pendingKillSession && (
									<span className="block font-mono text-xs">
										{pendingKillSession.workspaceId} /{" "}
										{pendingKillSession.sessionId}
									</span>
								)}
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setPendingKillSession(null)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							disabled={killDaemonSession.isPending}
							onClick={() => {
								const sessionId = pendingKillSession?.sessionId;
								setPendingKillSession(null);
								if (!sessionId) return;
								markTerminalKilledByUser(sessionId);
								killDaemonSession.mutate({ paneId: sessionId });
							}}
						>
							Kill
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={confirmRestartDaemonOpen}
				onOpenChange={setConfirmRestartDaemonOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Restart terminal daemon?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									This will shut down the terminal daemon process and kill all
									running sessions. Use this to fix terminals that are stuck or
									unresponsive.
								</span>
								<span className="block">
									A fresh daemon will start automatically when you open a new
									terminal.
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmRestartDaemonOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="default"
							size="sm"
							disabled={restartDaemon.isPending}
							onClick={() => {
								setConfirmRestartDaemonOpen(false);
								restartDaemon.mutate(undefined, {
									onSuccess: () => {
										for (const session of sessions) {
											markTerminalKilledByUser(session.sessionId);
										}
									},
								});
							}}
						>
							Restart daemon
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
