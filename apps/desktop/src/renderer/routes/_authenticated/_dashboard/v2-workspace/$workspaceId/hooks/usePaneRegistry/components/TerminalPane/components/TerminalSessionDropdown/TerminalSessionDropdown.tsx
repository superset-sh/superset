import type { RendererContext } from "@superset/panes";
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
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import {
	Check,
	ChevronDown,
	LoaderCircle,
	Plus,
	TerminalSquare,
	Trash2,
} from "lucide-react";
import {
	Fragment,
	useCallback,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { markTerminalForBackground } from "renderer/lib/terminal/terminal-background-intents";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";

interface TerminalSessionDropdownProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

interface VisibleTerminalSession {
	terminalId: string;
	workspaceId: string;
	createdAt?: number;
	exited: boolean;
	exitCode: number;
	attached: boolean;
	title: string | null;
	pending?: boolean;
}

interface TerminalPaneLocation {
	tabId: string;
	paneId: string;
	titleOverride?: string;
}

interface TerminalSessionGroup {
	workspaceId: string;
	label: string;
	sessions: VisibleTerminalSession[];
}

const EMPTY_TERMINAL_PANE_LOCATIONS = new Map<string, TerminalPaneLocation[]>();

function formatCreatedAt(createdAt: number | undefined): string {
	if (!createdAt) return "Creating";

	return getRelativeTime(createdAt, { format: "compact" });
}

function getTerminalPaneLocations(
	context: RendererContext<PaneViewerData>,
): Map<string, TerminalPaneLocation[]> {
	const locations = new Map<string, TerminalPaneLocation[]>();
	for (const tab of context.store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.id === context.pane.id || pane.kind !== "terminal") continue;
			const data = pane.data as Partial<TerminalPaneData>;
			if (data.terminalId) {
				const terminalLocations = locations.get(data.terminalId) ?? [];
				terminalLocations.push({
					tabId: tab.id,
					paneId: pane.id,
					titleOverride: pane.titleOverride,
				});
				locations.set(data.terminalId, terminalLocations);
			}
		}
	}
	return locations;
}

export function TerminalSessionDropdown({
	context,
	workspaceId,
}: TerminalSessionDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const data = context.pane.data as TerminalPaneData;
	const { terminalId } = data;
	const sessionWorkspaceId = data.workspaceId ?? workspaceId;
	const terminalInstanceId = context.pane.id;
	const navigate = useNavigate();
	const collections = useCollections();
	const utils = workspaceTrpc.useUtils();
	const killTerminalSession = workspaceTrpc.terminal.killSession.useMutation();
	const sessionsQuery = workspaceTrpc.terminal.listSessions.useQuery(
		{},
		{
			refetchInterval: isOpen ? 2_000 : false,
			refetchOnWindowFocus: true,
		},
	);
	const { data: workspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.select(({ v2Workspaces }) => ({
					id: v2Workspaces.id,
					name: v2Workspaces.name,
					branch: v2Workspaces.branch,
				})),
		[collections],
	);

	const workspaceLabels = useMemo(() => {
		const labels = new Map<string, string>();
		for (const row of workspaceRows) {
			labels.set(row.id, row.name || row.branch || "Workspace");
		}
		return labels;
	}, [workspaceRows]);

	const sessions = useMemo<VisibleTerminalSession[]>(() => {
		const liveSessions = sessionsQuery.data?.sessions ?? [];
		if (liveSessions.some((session) => session.terminalId === terminalId)) {
			return liveSessions;
		}
		return [
			{
				terminalId,
				workspaceId: sessionWorkspaceId,
				exited: false,
				exitCode: 0,
				attached: false,
				title: null,
				pending: true,
			},
			...liveSessions,
		];
	}, [sessionsQuery.data?.sessions, terminalId, sessionWorkspaceId]);
	const currentSession = sessions.find(
		(session) => session.terminalId === terminalId,
	);
	const sessionGroups = useMemo<TerminalSessionGroup[]>(() => {
		const groupsByWorkspaceId = new Map<string, VisibleTerminalSession[]>();
		for (const session of sessions) {
			const group = groupsByWorkspaceId.get(session.workspaceId) ?? [];
			group.push(session);
			groupsByWorkspaceId.set(session.workspaceId, group);
		}

		return [...groupsByWorkspaceId.entries()]
			.map(([groupWorkspaceId, groupSessions]) => ({
				workspaceId: groupWorkspaceId,
				label:
					groupWorkspaceId === workspaceId
						? "Current workspace"
						: (workspaceLabels.get(groupWorkspaceId) ?? "Unknown workspace"),
				sessions: [...groupSessions].sort((a, b) => {
					if (a.terminalId === terminalId) return -1;
					if (b.terminalId === terminalId) return 1;
					return (b.createdAt ?? 0) - (a.createdAt ?? 0);
				}),
			}))
			.sort((a, b) => {
				const aHasCurrent = a.sessions.some(
					(session) => session.terminalId === terminalId,
				);
				const bHasCurrent = b.sessions.some(
					(session) => session.terminalId === terminalId,
				);
				if (aHasCurrent !== bHasCurrent) return aHasCurrent ? -1 : 1;
				if (a.workspaceId === workspaceId && b.workspaceId !== workspaceId) {
					return -1;
				}
				if (b.workspaceId === workspaceId && a.workspaceId !== workspaceId) {
					return 1;
				}
				return a.label.localeCompare(b.label);
			});
	}, [sessions, terminalId, workspaceId, workspaceLabels]);
	const subscribeTitle = useCallback(
		(callback: () => void) =>
			terminalRuntimeRegistry.onTitleChange(
				terminalId,
				callback,
				terminalInstanceId,
			),
		[terminalId, terminalInstanceId],
	);
	const getTitleSnapshot = useCallback(
		() => terminalRuntimeRegistry.getTitle(terminalId, terminalInstanceId),
		[terminalId, terminalInstanceId],
	);
	const runtimeTitle = useSyncExternalStore(subscribeTitle, getTitleSnapshot);
	const renderTerminalPaneLocations = isOpen
		? getTerminalPaneLocations(context)
		: EMPTY_TERMINAL_PANE_LOCATIONS;

	const handleSelectSession = (session: VisibleTerminalSession) => {
		const nextTerminalId = session.terminalId;
		if (nextTerminalId === terminalId) {
			setIsOpen(false);
			return;
		}

		const state = context.store.getState();
		const terminalPaneLocations = getTerminalPaneLocations(context);
		const existingLocation = terminalPaneLocations.get(nextTerminalId)?.[0];
		if (existingLocation) {
			state.setActiveTab(existingLocation.tabId);
			state.setActivePane({
				tabId: existingLocation.tabId,
				paneId: existingLocation.paneId,
			});
			setIsOpen(false);
			return;
		}

		if (session.attached && session.workspaceId !== workspaceId) {
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: session.workspaceId },
				search: {
					terminalId: session.terminalId,
					focusRequestId: crypto.randomUUID(),
				},
			});
			setIsOpen(false);
			return;
		}

		if ((terminalPaneLocations.get(terminalId)?.length ?? 0) === 0) {
			markTerminalForBackground(terminalId);
		}

		state.setPaneData({
			paneId: context.pane.id,
			data: {
				terminalId: nextTerminalId,
				workspaceId: session.workspaceId,
			} as PaneViewerData,
		});
		state.setPaneTitleOverride({
			tabId: context.tab.id,
			paneId: context.pane.id,
			titleOverride: undefined,
		});
		setIsOpen(false);
	};

	const closePanesForTerminal = (targetTerminalId: string) => {
		const terminalPaneLocations = getTerminalPaneLocations(context);
		for (const location of terminalPaneLocations.get(targetTerminalId) ?? []) {
			context.store.getState().closePane({
				tabId: location.tabId,
				paneId: location.paneId,
			});
		}

		if (targetTerminalId === terminalId) {
			void context.actions.close();
		}
	};

	const removeTerminalSession = async (session: VisibleTerminalSession) => {
		try {
			await killTerminalSession.mutateAsync({
				terminalId: session.terminalId,
				workspaceId: session.workspaceId,
			});
			closePanesForTerminal(session.terminalId);
		} finally {
			await utils.terminal.listSessions.invalidate();
		}
	};

	const handleRemoveTerminal = (session: VisibleTerminalSession) => {
		toast.promise(removeTerminalSession(session), {
			loading: "Removing terminal...",
			success: "Terminal removed",
			error: "Failed to remove terminal",
		});
	};

	const handleNewTerminal = () => {
		const state = context.store.getState();
		const terminalPaneLocations = getTerminalPaneLocations(context);
		if ((terminalPaneLocations.get(terminalId)?.length ?? 0) === 0) {
			markTerminalForBackground(terminalId);
		}
		state.setPaneData({
			paneId: context.pane.id,
			data: {
				terminalId: crypto.randomUUID(),
				workspaceId,
			} as PaneViewerData,
		});
		state.setPaneTitleOverride({
			tabId: context.tab.id,
			paneId: context.pane.id,
			titleOverride: undefined,
		});
		void utils.terminal.listSessions.invalidate();
		setIsOpen(false);
	};

	const hostTitle =
		runtimeTitle !== undefined ? runtimeTitle : currentSession?.title;
	const titleOverride = context.pane.titleOverride;
	const triggerTitle = hostTitle ?? titleOverride ?? "Terminal";

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Terminal sessions"
					title={triggerTitle}
					className="flex min-w-32 max-w-96 items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onMouseDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<TerminalSquare className="size-3.5 shrink-0" />
					<span className="min-w-0 flex-1 truncate text-left">
						{triggerTitle}
					</span>
					{sessionsQuery.isFetching && isOpen ? (
						<LoaderCircle className="size-3 shrink-0 animate-spin" />
					) : (
						<ChevronDown className="size-3 shrink-0" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-96">
				<DropdownMenuLabel className="flex items-center gap-2 text-xs">
					<span className="min-w-0 flex-1 truncate">Terminal Sessions</span>
					<button
						type="button"
						aria-label="New terminal"
						title="New terminal"
						className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							handleNewTerminal();
						}}
					>
						<Plus className="size-3.5" />
					</button>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<div className="max-h-80 overflow-y-auto">
					{sessionGroups.length > 0 ? (
						sessionGroups.map((group, groupIndex) => (
							<Fragment key={group.workspaceId}>
								{groupIndex > 0 && <DropdownMenuSeparator />}
								<div
									className="flex min-w-0 items-center gap-2 px-2 pt-2 pb-1 text-muted-foreground text-xs"
									title={group.label}
								>
									<span className="min-w-0 flex-1 truncate font-medium">
										{group.label}
									</span>
									<span className="shrink-0 text-muted-foreground/60 tabular-nums">
										{group.sessions.length}
									</span>
								</div>
								{group.sessions.map((session) => {
									const isCurrent = session.terminalId === terminalId;
									const location = renderTerminalPaneLocations.get(
										session.terminalId,
									)?.[0];
									const createdAtLabel = formatCreatedAt(session.createdAt);
									const status = isCurrent
										? "Current"
										: session.pending
											? "Starting"
											: session.attached
												? "Attached"
												: "Detached";
									const title = isCurrent
										? triggerTitle
										: (session.title ?? location?.titleOverride ?? "Terminal");

									return (
										<DropdownMenuItem
											key={session.terminalId}
											className="group flex items-center gap-2"
											onSelect={(_event) => {
												handleSelectSession(session);
											}}
										>
											<span className="w-4 shrink-0">
												{isCurrent && <Check className="size-3.5" />}
											</span>
											<span className="min-w-0 flex-1 truncate text-xs">
												{title}
											</span>
											<span className="shrink-0 text-xs text-muted-foreground/70">
												{createdAtLabel}
											</span>
											<span className="shrink-0 text-xs text-muted-foreground">
												{status}
											</span>
											<button
												type="button"
												aria-label={`Remove terminal ${session.createdAt ? createdAtLabel : "session"}`}
												disabled={killTerminalSession.isPending}
												className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 group-hover:opacity-100"
												onClick={(event) => {
													event.preventDefault();
													event.stopPropagation();
													handleRemoveTerminal(session);
												}}
											>
												<Trash2 className="size-3" />
											</button>
										</DropdownMenuItem>
									);
								})}
							</Fragment>
						))
					) : (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							No live sessions
						</div>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
