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
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { markTerminalKilledByUser } from "renderer/lib/terminal-kill-tracking";
import { DEFAULT_TERMINAL_PERSISTENCE } from "shared/constants";

export const Route = createFileRoute("/_authenticated/settings/terminal/")({
	component: TerminalSettingsPage,
});

function TerminalSettingsPage() {
	const utils = electronTrpc.useUtils();
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
	const [showSessionList, setShowSessionList] = useState(false);
	const [pendingKillSession, setPendingKillSession] = useState<{
		sessionId: string;
		workspaceId: string;
	} | null>(null);
	const setTerminalPersistence =
		electronTrpc.settings.setTerminalPersistence.useMutation({
			onMutate: async ({ enabled }) => {
				// Cancel outgoing fetches
				await utils.settings.getTerminalPersistence.cancel();
				// Snapshot previous value
				const previous = utils.settings.getTerminalPersistence.getData();
				// Optimistically update
				utils.settings.getTerminalPersistence.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				// Rollback on error
				if (context?.previous !== undefined) {
					utils.settings.getTerminalPersistence.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				// Refetch to ensure sync with server
				utils.settings.getTerminalPersistence.invalidate();
			},
		});

	const handleToggle = (enabled: boolean) => {
		setTerminalPersistence.mutate({ enabled });
	};

	const killAllDaemonSessions =
		electronTrpc.terminal.killAllDaemonSessions.useMutation({
			onMutate: async () => {
				// Cancel outgoing fetches to avoid race conditions
				await utils.terminal.listDaemonSessions.cancel();
				// Snapshot previous data for rollback
				const previous = utils.terminal.listDaemonSessions.getData();
				// Optimistically clear the list immediately for instant UI feedback
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
				// Rollback on error
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
				// Always refetch to get actual state after mutation settles
				// Small delay to allow daemon to finish cleanup
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

	const formatTimestamp = (value?: string) => {
		if (!value) return "—";
		return value.replace("T", " ").replace(/\.\d+Z$/, "Z");
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Terminal</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure terminal behavior and persistence
				</p>
			</div>

			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label
							htmlFor="terminal-persistence"
							className="text-sm font-medium"
						>
							Terminal persistence
						</Label>
						<p className="text-xs text-muted-foreground">
							Keep terminal sessions alive across app restarts and workspace
							switches. TUI apps like Claude Code will resume exactly where you
							left off.
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

				<div className="rounded-md border border-border/60 p-4 space-y-3">
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
								Enable terminal persistence and restart the app to manage daemon
								sessions.
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
							variant="ghost"
							size="sm"
							disabled={!daemonModeEnabled || aliveSessions.length === 0}
							onClick={() => setShowSessionList((v) => !v)}
						>
							{showSessionList ? "Hide sessions" : "Show sessions"}
						</Button>
					</div>

					{daemonModeEnabled && showSessionList && aliveSessions.length > 0 && (
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
											<th className="px-2 py-2 text-right font-medium">PID</th>
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
											<tr key={session.sessionId} className="hover:bg-muted/30">
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
									You can’t undo this action. Terminal panes will show “Process
									exited” and can be restarted.
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
		</div>
	);
}
