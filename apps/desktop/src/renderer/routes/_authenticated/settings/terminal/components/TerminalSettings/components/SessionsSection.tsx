import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
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
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function SessionsSection() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();

	const { data: daemonSessions } =
		electronTrpc.terminal.listDaemonSessions.useQuery();
	const sessions = daemonSessions?.sessions ?? [];
	const aliveSessions = useMemo(
		() => sessions.filter((session) => session.isAlive),
		[sessions],
	);
	const sessionsSorted = useMemo(() => {
		return [...aliveSessions].sort((a, b) => {
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

	const killAllDaemonSessions =
		electronTrpc.terminal.killAllDaemonSessions.useMutation({
			onMutate: async () => {
				await utils.terminal.listDaemonSessions.cancel();
				const previous = utils.terminal.listDaemonSessions.getData();
				utils.terminal.listDaemonSessions.setData(undefined, {
					sessions: [],
				});
				return { previous };
			},
			onSuccess: (result) => {
				if (result.remainingCount > 0) {
					toast.warning(
						t({
							message: "Some sessions could not be killed",
						}),
						{
							description: t({
								message: `${result.killedCount} terminated, ${result.remainingCount} remaining`,
							}),
						},
					);
				} else {
					toast.success(
						t({
							message: "Killed all terminal sessions",
						}),
						{
							description: t({
								message: `${result.killedCount} sessions terminated`,
							}),
						},
					);
				}
			},
			onError: (error, _vars, context) => {
				if (context?.previous) {
					utils.terminal.listDaemonSessions.setData(
						undefined,
						context.previous,
					);
				}
				toast.error(
					t({
						message: "Failed to kill sessions",
					}),
					{
						description: errorMessage(error),
					},
				);
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
				toast.success(
					t({
						message: "Cleared terminal history",
					}),
				);
				utils.terminal.listDaemonSessions.invalidate();
			},
			onError: (error) => {
				toast.error(
					t({
						message: "Failed to clear terminal history",
					}),
					{
						description: errorMessage(error),
					},
				);
			},
		});

	const killDaemonSession = electronTrpc.terminal.kill.useMutation({
		onSuccess: () => {
			toast.success(
				t({
					message: "Killed terminal session",
				}),
			);
			utils.terminal.listDaemonSessions.invalidate();
		},
		onError: (error) => {
			toast.error(
				t({
					message: "Failed to kill session",
				}),
				{
					description: errorMessage(error),
				},
			);
		},
	});

	const restartDaemon = electronTrpc.terminal.restartDaemon.useMutation({
		onSuccess: () => {
			toast.success(
				t({
					message: "Daemon restarted",
				}),
				{
					description: t({
						message:
							"All sessions killed and daemon restarted. The app will use a fresh daemon.",
					}),
				},
			);
			utils.terminal.listDaemonSessions.invalidate();
		},
		onError: (error) => {
			toast.error(
				t({
					message: "Failed to restart daemon",
				}),
				{
					description: errorMessage(error),
				},
			);
		},
	});

	const formatTimestamp = (value?: string) => {
		if (!value) return "—";
		return value.replace("T", " ").replace(/\.\d+Z$/, "Z");
	};

	return (
		<>
			<div className="rounded-md border border-border/60 p-4 space-y-3">
				<div className="space-y-0.5">
					<div className="flex items-center justify-between">
						<Label className="text-sm font-medium">
							<HighlightText
								text={t({
									message: "Terminal daemon",
								})}
								query={searchQuery}
							/>
						</Label>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => utils.terminal.listDaemonSessions.invalidate()}
						>
							<Trans>Refresh</Trans>
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						<Trans>Daemon sessions running: {aliveSessions.length}</Trans>
					</p>
					{aliveSessions.length >= 20 && (
						<p className="text-xs text-muted-foreground/70">
							<Trans>
								Large numbers of persistent terminals can increase CPU/memory
								usage. Consider killing old sessions if you notice slowdowns.
							</Trans>
						</p>
					)}
				</div>

				<div className="flex flex-wrap gap-2">
					<Button
						variant="destructive"
						size="sm"
						disabled={
							aliveSessions.length === 0 || killAllDaemonSessions.isPending
						}
						onClick={() => setConfirmKillAllOpen(true)}
					>
						<Trans>Kill all sessions</Trans>
					</Button>
					<Button
						variant="secondary"
						size="sm"
						disabled={
							aliveSessions.length === 0 || clearTerminalHistory.isPending
						}
						onClick={() => setConfirmClearHistoryOpen(true)}
					>
						<Trans>Clear terminal history</Trans>
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={restartDaemon.isPending}
						onClick={() => setConfirmRestartDaemonOpen(true)}
					>
						<Trans>Restart daemon</Trans>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						disabled={aliveSessions.length === 0}
						onClick={() => setShowSessionList((v) => !v)}
					>
						{showSessionList ? (
							<Trans>Hide sessions</Trans>
						) : (
							<Trans>Show sessions</Trans>
						)}
					</Button>
				</div>

				{showSessionList && aliveSessions.length > 0 && (
					<div className="rounded-md border border-border/60 overflow-hidden">
						<div className="max-h-64 overflow-auto">
							<table className="w-full text-xs">
								<thead className="sticky top-0 bg-background">
									<tr className="text-muted-foreground">
										<th className="px-2 py-2 text-left font-medium">
											<Trans>Workspace</Trans>
										</th>
										<th className="px-2 py-2 text-left font-medium">
											<Trans>Session</Trans>
										</th>
										<th className="px-2 py-2 text-right font-medium">
											<Trans>Clients</Trans>
										</th>
										<th className="px-2 py-2 text-right font-medium">
											<Trans>PID</Trans>
										</th>
										<th className="px-2 py-2 text-left font-medium">
											<Trans>Last attached</Trans>
										</th>
										<th className="px-2 py-2 text-right font-medium">
											<Trans>Action</Trans>
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
													<Trans>Kill</Trans>
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

			<AlertDialog
				open={confirmKillAllOpen}
				onOpenChange={setConfirmKillAllOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							<Trans>Kill all terminal sessions?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									<Trans>
										This will terminate all persistent terminal processes
										(builds, tests, agents, etc.).
									</Trans>
								</span>
								<span className="block">
									<Trans>
										You can't undo this action. Terminal panes will show
										"Process exited" and can be restarted.
									</Trans>
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
							<Trans>Cancel</Trans>
						</Button>
						<Button
							variant="destructive"
							size="sm"
							disabled={killAllDaemonSessions.isPending}
							onClick={() => {
								setConfirmKillAllOpen(false);
								killAllDaemonSessions.mutate();
							}}
						>
							<Trans>Kill all</Trans>
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
							<Trans>Clear terminal history?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									<Trans>
										This deletes the saved scrollback used for reboot/crash
										recovery.
									</Trans>
								</span>
								<span className="block">
									<Trans>
										Running terminal processes continue, but older output may no
										longer be available after restarting the app.
									</Trans>
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
							<Trans>Cancel</Trans>
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
							<Trans>Clear history</Trans>
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
							<Trans>Kill terminal session?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									<Trans>
										This will terminate the session and its underlying process.
									</Trans>
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
							<Trans>Cancel</Trans>
						</Button>
						<Button
							variant="destructive"
							size="sm"
							disabled={killDaemonSession.isPending}
							onClick={() => {
								const sessionId = pendingKillSession?.sessionId;
								setPendingKillSession(null);
								if (!sessionId) return;
								killDaemonSession.mutate({ paneId: sessionId });
							}}
						>
							<Trans>Kill</Trans>
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
							<Trans>Restart terminal daemon?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									<Trans>
										This will kill all running sessions and restart the terminal
										daemon. The app will restart terminals with a fresh daemon.
									</Trans>
								</span>
								<span className="block">
									<Trans>
										Use this to fix terminals that are stuck or unresponsive.
									</Trans>
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
							<Trans>Cancel</Trans>
						</Button>
						<Button
							variant="default"
							size="sm"
							disabled={restartDaemon.isPending}
							onClick={() => {
								setConfirmRestartDaemonOpen(false);
								restartDaemon.mutate(undefined, {});
							}}
						>
							<Trans>Restart daemon</Trans>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
