import type { RendererContext } from "@superset/panes";
import { alert } from "@superset/ui/atoms/Alert";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	Check,
	ChevronDown,
	LoaderCircle,
	Plus,
	TerminalSquare,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

interface TerminalSessionDropdownProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

interface VisibleTerminalSession {
	terminalId: string;
	workspaceId: string;
	exited: boolean;
	exitCode: number;
	attached: boolean;
	pending?: boolean;
}

interface TerminalPaneLocation {
	tabId: string;
	paneId: string;
	titleOverride?: string;
}

function getShortTerminalId(terminalId: string): string {
	return terminalId.length <= 8 ? terminalId : terminalId.slice(0, 8);
}

function findTerminalPaneLocation(
	context: RendererContext<PaneViewerData>,
	terminalId: string,
): TerminalPaneLocation | null {
	for (const tab of context.store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.id === context.pane.id || pane.kind !== "terminal") continue;
			const data = pane.data as Partial<TerminalPaneData>;
			if (data.terminalId === terminalId) {
				return {
					tabId: tab.id,
					paneId: pane.id,
					titleOverride: pane.titleOverride,
				};
			}
		}
	}
	return null;
}

export function TerminalSessionDropdown({
	context,
	workspaceId,
}: TerminalSessionDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const data = context.pane.data as TerminalPaneData;
	const { terminalId } = data;
	const utils = workspaceTrpc.useUtils();
	const killTerminalSession = workspaceTrpc.terminal.killSession.useMutation();
	const sessionsQuery = workspaceTrpc.terminal.listSessions.useQuery(
		{ workspaceId },
		{
			enabled: isOpen,
			refetchInterval: isOpen ? 2_000 : false,
			refetchOnWindowFocus: true,
		},
	);

	const sessions = useMemo<VisibleTerminalSession[]>(() => {
		const liveSessions = sessionsQuery.data?.sessions ?? [];
		if (liveSessions.some((session) => session.terminalId === terminalId)) {
			return liveSessions;
		}
		return [
			{
				terminalId,
				workspaceId,
				exited: false,
				exitCode: 0,
				attached: false,
				pending: true,
			},
			...liveSessions,
		];
	}, [sessionsQuery.data?.sessions, terminalId, workspaceId]);

	const handleSelectSession = (nextTerminalId: string) => {
		if (nextTerminalId === terminalId) {
			setIsOpen(false);
			return;
		}

		const state = context.store.getState();
		const existingLocation = findTerminalPaneLocation(context, nextTerminalId);
		if (existingLocation) {
			state.setPaneData({
				paneId: existingLocation.paneId,
				data: { terminalId } as PaneViewerData,
			});
			state.setPaneTitleOverride({
				tabId: existingLocation.tabId,
				paneId: existingLocation.paneId,
				titleOverride: context.pane.titleOverride,
			});
		}

		state.setPaneData({
			paneId: context.pane.id,
			data: { terminalId: nextTerminalId } as PaneViewerData,
		});
		state.setPaneTitleOverride({
			tabId: context.tab.id,
			paneId: context.pane.id,
			titleOverride: existingLocation?.titleOverride,
		});
		setIsOpen(false);
	};

	const closePaneForTerminal = (targetTerminalId: string) => {
		if (targetTerminalId === terminalId) {
			void context.actions.close();
			return;
		}

		const location = findTerminalPaneLocation(context, targetTerminalId);
		if (!location) return;

		context.store.getState().closePane({
			tabId: location.tabId,
			paneId: location.paneId,
		});
	};

	const removeTerminalSession = async (targetTerminalId: string) => {
		await killTerminalSession.mutateAsync({ terminalId: targetTerminalId });
		closePaneForTerminal(targetTerminalId);
		await utils.terminal.listSessions.invalidate({ workspaceId });
	};

	const handleRemoveTerminal = (targetTerminalId: string) => {
		alert({
			title: "Remove terminal session?",
			description:
				"This will terminate the underlying process. Use Move terminal to background to keep it running without a pane.",
			actions: [
				{ label: "Cancel", variant: "outline", onClick: () => {} },
				{
					label: "Remove Terminal",
					variant: "destructive",
					onClick: () => {
						toast.promise(removeTerminalSession(targetTerminalId), {
							loading: "Removing terminal...",
							success: "Terminal removed",
							error: "Failed to remove terminal",
						});
					},
				},
			],
		});
	};

	const handleNewTerminal = () => {
		const state = context.store.getState();
		state.setPaneData({
			paneId: context.pane.id,
			data: {
				terminalId: crypto.randomUUID(),
			} as PaneViewerData,
		});
		state.setPaneTitleOverride({
			tabId: context.tab.id,
			paneId: context.pane.id,
			titleOverride: undefined,
		});
		void utils.terminal.listSessions.invalidate({ workspaceId });
		setIsOpen(false);
	};

	const triggerTitle = context.pane.titleOverride ?? "Terminal";

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Terminal sessions"
					className="flex min-w-0 max-w-72 items-center gap-1.5 rounded px-1.5 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onMouseDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<TerminalSquare className="size-4 shrink-0" />
					<span className="min-w-0 truncate">{triggerTitle}</span>
					<span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
						{getShortTerminalId(terminalId)}
					</span>
					{sessionsQuery.isFetching && isOpen ? (
						<LoaderCircle className="size-3 shrink-0 animate-spin" />
					) : (
						<ChevronDown className="size-3 shrink-0" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-80">
				<DropdownMenuLabel className="text-xs">
					Terminal Sessions
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<div className="max-h-80 overflow-y-auto">
					{sessions.length > 0 ? (
						sessions.map((session) => {
							const isCurrent = session.terminalId === terminalId;
							const location = findTerminalPaneLocation(
								context,
								session.terminalId,
							);
							const canSelect =
								isCurrent || !session.attached || location !== null;
							const status = isCurrent
								? "Current"
								: location
									? "Swap"
									: session.pending
										? "Starting"
										: session.attached
											? "Attached"
											: "Detached";
							const title = isCurrent
								? triggerTitle
								: (location?.titleOverride ?? "Terminal");

							return (
								<DropdownMenuItem
									key={session.terminalId}
									className={`group flex items-center gap-2 ${!canSelect ? "text-muted-foreground/50" : ""}`}
									onSelect={(event) => {
										if (!canSelect) {
											event.preventDefault();
											return;
										}
										handleSelectSession(session.terminalId);
									}}
								>
									<span className="w-4 shrink-0">
										{isCurrent && <Check className="size-3.5" />}
									</span>
									<span className="min-w-0 flex-1 truncate text-xs">
										{title}
									</span>
									<span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
										{getShortTerminalId(session.terminalId)}
									</span>
									<span className="shrink-0 text-xs text-muted-foreground">
										{status}
									</span>
									<button
										type="button"
										aria-label={`Remove terminal ${getShortTerminalId(session.terminalId)}`}
										disabled={killTerminalSession.isPending}
										className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 group-hover:opacity-100"
										onClick={(event) => {
											event.preventDefault();
											event.stopPropagation();
											handleRemoveTerminal(session.terminalId);
										}}
									>
										<Trash2 className="size-3" />
									</button>
								</DropdownMenuItem>
							);
						})
					) : (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							No live sessions
						</div>
					)}
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={handleNewTerminal}>
					<Plus className="mr-1.5 size-3.5" />
					<span className="text-xs">New Terminal</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
