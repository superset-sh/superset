import { Trans, useLingui } from "@lingui/react/macro";
import type { WorkspaceStore } from "@superset/panes";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { ArrowLeft, GitCompareArrows, ListTree, Square } from "lucide-react";
import {
	type MouseEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { env } from "renderer/env.renderer";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { usePagePolicy } from "renderer/lib/clickPolicy";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { clearTerminalBackgroundMarker } from "renderer/lib/terminal/terminal-background-intents";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { usePageFavorites } from "renderer/routes/_authenticated/_dashboard/hooks/usePageFavorites";
import { usePagesList } from "renderer/routes/_authenticated/_dashboard/hooks/usePagesList";
import { pagesListInput } from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import type { StoreApi } from "zustand/vanilla";
import type { CreateNewAgentSession } from "../../hooks/useAgentSessionLauncher";
import { useChatWiring } from "../../hooks/usePaneRegistry/components/ChatSession/hooks/useSessionClient";
import { usePRFlowState } from "../../hooks/usePRFlowState";
import { useShipActions } from "../../hooks/useShipActions";
import { useWorkspaceGitStatus } from "../../providers/WorkspaceGitStatusProvider";
import type { PagePaneData, PaneViewerData } from "../../types";
import {
	BACKGROUND_TERMINAL_ATTACHMENT_DEBOUNCE_MS,
	getAttachedTerminalIdsKey,
	getBackgroundTerminalRefetchInterval,
	getBackgroundTerminalSessions,
	parseAttachedTerminalIdsKey,
} from "../../utils/backgroundTerminals";
import { changesPillStats } from "../../utils/changesPillStats";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";
import { getShipMenuActions } from "../../utils/getShipMenuActions";
import { openSubagentPaneInStore } from "../../utils/openSubagentPaneInStore";
import { ChangesStats } from "../ChangesStats";
import { CommitForm } from "../CommitForm";
import { CreatePrForm } from "../CreatePrForm";
import { NewPageComposer } from "../NewPageComposer";
import {
	ActivityMenuHeader,
	type ShipView,
} from "./components/ActivityMenuHeader";
import { BackgroundWorkRow } from "./components/BackgroundWorkRow";
import { ChangesMenuRow } from "./components/ChangesMenuRow";
import { MenuGroup } from "./components/MenuGroup";
import { PagesMenuRow } from "./components/PagesMenuRow";
import {
	usePagesMenuSeenAt,
	usePagesMenuSeenStore,
} from "./stores/pagesMenuSeenStore";
import {
	type BackgroundWork,
	collectBackgroundWork,
} from "./utils/collectBackgroundWork";
import { type MenuPage, selectMenuPages } from "./utils/selectMenuPages";

const MENU_PAGE_LIMIT = 200;
const CLOCK_TICK_MS = 1000;

interface WorkspaceActivityMenuProps {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
	isLayoutReady: boolean;
	onOpenPage: (page: PagePaneData, placement: "split" | "tab") => void;
	onCreateNewAgentSession: CreateNewAgentSession;
	onFocusAgentTerminal: (terminalId: string) => void;
	changes?: { isOpen: boolean; onToggle: () => void };
}

export function WorkspaceActivityMenu({
	workspaceId,
	store,
	linkedStores,
	isLayoutReady,
	onOpenPage,
	onCreateNewAgentSession,
	onFocusAgentTerminal,
	changes,
}: WorkspaceActivityMenuProps) {
	const { t } = useLingui();
	const paneAreaStyle = changes != null;
	const { favoritePageIds } = usePageFavorites();
	const gitStatus = useWorkspaceGitStatus();
	const changesStats = useMemo(
		() => (gitStatus.data ? changesPillStats(gitStatus.data) : null),
		[gitStatus.data],
	);
	const triggerChangesStats =
		changes && changesStats && changesStats.fileCount > 0 ? changesStats : null;
	const { workspace: currentWorkspace } = useWorkspace();
	const [shipView, setShipView] = useState<ShipView | null>(null);
	const [open, setOpen] = useState(false);
	const newPageStatusId = useId();
	const {
		flowState,
		sync: branchSync,
		onRetry: refreshFlowState,
	} = usePRFlowState(workspaceId, {
		enabled: paneAreaStyle && open,
	});
	const shipActions = useShipActions({
		workspaceId,
		onRefresh: refreshFlowState,
		isPrFormOpen: shipView === "pr",
		enabled: paneAreaStyle && open,
		onCommitted: () => setShipView(null),
		onPrCreated: () => setShipView(null),
	});
	const shipMenu = getShipMenuActions({
		flowState,
		sync: branchSync,
		workspaceCanCreatePr: shipActions.canCreatePr,
		commitsLoaded: shipActions.commitsLoaded,
	});

	const pagePolicy = usePagePolicy("4-tier");
	const utils = cloudTrpc.useUtils();
	const seenAt = usePagesMenuSeenAt(workspaceId);
	const markSeen = usePagesMenuSeenStore((state) => state.markSeen);

	const [composing, setComposing] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
	const chatWiring = useChatWiring();

	const bindings = useTerminalAgentBindings(workspaceId);
	const terminalUtils = workspaceTrpc.useUtils();
	const killTerminal = workspaceTrpc.terminal.killSession.useMutation();
	const subscribeAttachedStores = useCallback(
		(onChange: () => void) => {
			const unsubscribes = [store, ...linkedStores].map((paneStore) =>
				paneStore.subscribe(onChange),
			);
			return () => {
				for (const unsubscribe of unsubscribes) unsubscribe();
			};
		},
		[store, linkedStores],
	);
	const getAttachedSnapshot = useCallback(
		() =>
			getAttachedTerminalIdsKey(
				[store, ...linkedStores].flatMap(
					(paneStore) => paneStore.getState().tabs,
				),
			),
		[store, linkedStores],
	);
	const attachedTerminalIdsKey = useSyncExternalStore(
		subscribeAttachedStores,
		getAttachedSnapshot,
		getAttachedSnapshot,
	);
	const terminalSessionsQuery = workspaceTrpc.terminal.list.useQuery(
		{ workspaceId },
		{
			refetchInterval: getBackgroundTerminalRefetchInterval(open),
			refetchOnWindowFocus: open,
			staleTime: open ? 1_000 : 5_000,
		},
	);
	const settledAttachedTerminalIdsKey = useDebouncedValue(
		attachedTerminalIdsKey,
		BACKGROUND_TERMINAL_ATTACHMENT_DEBOUNCE_MS,
	);
	const detachedTerminals = useMemo(
		() =>
			isLayoutReady
				? getBackgroundTerminalSessions(
						terminalSessionsQuery.data?.sessions ?? [],
						parseAttachedTerminalIdsKey(settledAttachedTerminalIdsKey),
					)
				: [],
		[
			isLayoutReady,
			terminalSessionsQuery.data?.sessions,
			settledAttachedTerminalIdsKey,
		],
	);
	const { processes, subagents } = useMemo(
		() => collectBackgroundWork(bindings.values(), detachedTerminals),
		[bindings, detachedTerminals],
	);
	const getSourceLabelsSnapshot = useCallback(
		() =>
			JSON.stringify(
				[store, ...linkedStores]
					.flatMap((paneStore) => paneStore.getState().tabs)
					.flatMap((tab) =>
						Object.values(tab.panes).flatMap((pane) => {
							const data = pane.data as {
								terminalId?: string;
								chatTitle?: string;
							};
							const label =
								tab.titleOverride ?? pane.titleOverride ?? data.chatTitle;
							return data.terminalId && label ? [[data.terminalId, label]] : [];
						}),
					),
			),
		[store, linkedStores],
	);
	const sourceLabelsKey = useSyncExternalStore(
		subscribeAttachedStores,
		getSourceLabelsSnapshot,
		getSourceLabelsSnapshot,
	);
	const sourceLabels = useMemo(
		() => new Map<string, string>(JSON.parse(sourceLabelsKey)),
		[sourceLabelsKey],
	);
	const workSourceCount = new Set(
		[...processes, ...subagents].map((work) => work.terminalId),
	).size;
	const stoppableAgentTasks = processes.filter(
		(work) => work.stop?.type === "chat",
	);
	const runningCount =
		processes.filter((work) => !work.detachedTerminal).length +
		subagents.length;

	useEffect(() => {
		if (!open || processes.length + subagents.length === 0) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
		return () => clearInterval(timer);
	}, [open, processes.length, subagents.length]);

	// This menu orders by publish time, not creation time, so it takes one
	// large batch rather than the grid's scroll-sized one. Built once because
	// `invalidate` matches a cached query by its input — a different `limit`
	// here than below and neither a publish nor opening the menu would refresh.
	const workspaceFilter = useMemo(
		() => ({ workspaceId, limit: MENU_PAGE_LIMIT }),
		[workspaceId],
	);
	const workspaceListInput = useMemo(
		() => pagesListInput(workspaceFilter),
		[workspaceFilter],
	);
	const workspacePagesQuery = usePagesList(workspaceFilter, {
		staleTime: 60_000,
	});
	// Only the pins, by id — this menu never needed the rest of the org.
	const pinnedPagesQuery = usePagesList(
		{ ids: favoritePageIds, limit: MENU_PAGE_LIMIT },
		{
			enabled: open && !paneAreaStyle && favoritePageIds.length > 0,
			staleTime: 60_000,
		},
	);

	// A publish from this workspace registers its agent as the page's watcher.
	useWorkspaceEvent(
		"page-watch:changed",
		workspaceId,
		useCallback(() => {
			void utils.page.listPaginated.invalidate(workspaceListInput);
		}, [utils, workspaceListInput]),
	);

	const { workspace, pinned, hasNew } = useMemo(
		() =>
			selectMenuPages({
				workspacePages: workspacePagesQuery.items,
				orgPages: paneAreaStyle ? [] : pinnedPagesQuery.items,
				favoritePageIds: paneAreaStyle ? [] : favoritePageIds,
				seenAt,
			}),
		[
			workspacePagesQuery.items,
			pinnedPagesQuery.items,
			favoritePageIds,
			paneAreaStyle,
			seenAt,
		],
	);

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) {
			void utils.page.listPaginated.invalidate(workspaceListInput);
			return;
		}
		setComposing(false);
		setShipView(null);
		markSeen(workspaceId, workspace[0]?.publishedAtMs ?? 0);
	};

	const handleOpenPage = (page: MenuPage, event: MouseEvent) => {
		handleOpenChange(false);
		const action = pagePolicy.getAction(event) ?? "pane";
		if (action === "external") {
			const url = new URL(
				`/page/${encodeURIComponent(page.slug)}`,
				env.NEXT_PUBLIC_WEB_URL,
			).toString();
			electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
				console.error(
					"[WorkspaceActivityMenu] Failed to open page:",
					url,
					error,
				);
			});
			return;
		}
		onOpenPage(
			{ pageId: page.id, slug: page.slug, title: page.title },
			action === "newTab" ? "tab" : "split",
		);
	};

	const handleOpenWork = (work: BackgroundWork) => {
		handleOpenChange(false);
		if (work.detachedTerminal) {
			clearTerminalBackgroundMarker(workspaceId, work.terminalId);
			focusOrAddTerminalPane(store, work.terminalId);
			void terminalUtils.terminal.list.invalidate({ workspaceId });
			return;
		}
		if (work.subagent) {
			openSubagentPaneInStore(store, {
				terminalId: work.terminalId,
				subagentId: work.subagent.id,
				agentId: work.subagent.agentId,
				...(work.subagent.agentType
					? { agentType: work.subagent.agentType }
					: {}),
			});
			return;
		}
		onFocusAgentTerminal(work.terminalId);
	};

	const handleStopWork = (work: BackgroundWork) => {
		const target = work.stop;
		if (!target) return;
		setStopping((current) => new Set(current).add(work.key));
		const release = () =>
			setStopping((current) => {
				const next = new Set(current);
				next.delete(work.key);
				return next;
			});
		const stopped =
			target.type === "terminal"
				? killTerminal
						.mutateAsync({ terminalId: work.terminalId, workspaceId })
						.then(() => {
							clearTerminalBackgroundMarker(workspaceId, work.terminalId);
							void terminalUtils.terminal.list.invalidate({ workspaceId });
						})
				: chatWiring.transport
						.stopBackgroundTask({
							commandId: crypto.randomUUID(),
							sessionId: target.chatSessionId,
							taskId: target.taskId,
						})
						.then((done) => {
							if (!done) throw new Error("the agent did not stop the task");
						});
		void stopped
			.catch((error: unknown) => {
				console.warn("[WorkspaceActivityMenu] could not stop task", error);
				toast.error(t({ message: "Couldn't stop the background task" }));
			})
			.finally(release);
	};

	const stopAll = () => {
		for (const work of stoppableAgentTasks) {
			if (!stopping.has(work.key)) handleStopWork(work);
		}
	};

	const workRows = (items: BackgroundWork[]) =>
		items.map((work) => (
			<BackgroundWorkRow
				key={work.key}
				work={work}
				source={
					workSourceCount > 1 ? sourceLabels.get(work.terminalId) : undefined
				}
				now={now}
				stopping={stopping.has(work.key)}
				onOpen={handleOpenWork}
				onStop={handleStopWork}
			/>
		));

	const emptyRow = (message: ReactNode) => (
		<div className="px-2 py-1.5 text-xs text-muted-foreground/70">
			{message}
		</div>
	);

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<Tooltip disableHoverableContent>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Workspace activity" })}
							aria-describedby={hasNew ? newPageStatusId : undefined}
							className={cn(
								"no-drag relative flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 text-xs font-medium text-muted-foreground/80 transition-colors",
								"hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								open && "bg-muted/60 text-foreground",
							)}
						>
							<ListTree className="size-3.5 shrink-0" />
							{runningCount > 0 ? (
								<>
									<span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
									<span className="tabular-nums">{runningCount}</span>
								</>
							) : (
								!paneAreaStyle &&
								workspace.length > 0 && (
									<span className="tabular-nums">{workspace.length}</span>
								)
							)}
							{triggerChangesStats && (
								<>
									<span className="h-3.5 w-px shrink-0 bg-border" />
									<GitCompareArrows className="size-3.5 shrink-0" />
									<span className="flex items-center gap-1">
										<ChangesStats stats={triggerChangesStats} />
									</span>
								</>
							)}
							{hasNew && (
								<>
									<span
										aria-hidden="true"
										className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-blue-500"
									/>
									<span id={newPageStatusId} className="sr-only">
										<Trans context="badge on a page published since the menu was last opened">
											New
										</Trans>
									</span>
								</>
							)}
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans>Background work and pages</Trans>
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				align="end"
				sideOffset={6}
				className="w-80 p-1"
				onKeyDown={(event) => {
					if (composing || shipView) return;
					if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
					const items = [
						...event.currentTarget.querySelectorAll<HTMLElement>(
							"button:not([disabled])",
						),
					];
					if (items.length === 0) return;
					event.preventDefault();
					const index = items.indexOf(document.activeElement as HTMLElement);
					const step = event.key === "ArrowDown" ? 1 : -1;
					items[(index + step + items.length) % items.length]?.focus();
				}}
				onEscapeKeyDown={(event) => {
					if (shipView) {
						event.preventDefault();
						setShipView(null);
						return;
					}
					if (!composing) return;
					event.preventDefault();
					setComposing(false);
				}}
			>
				{composing ? (
					<>
						<button
							type="button"
							onClick={() => setComposing(false)}
							className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
						>
							<ArrowLeft className="size-3.5 shrink-0" />
							<Trans>New page</Trans>
						</button>
						<NewPageComposer
							workspaceId={workspaceId}
							onSent={() => handleOpenChange(false)}
							onCreateNewAgentSession={onCreateNewAgentSession}
							onFocusAgentTerminal={onFocusAgentTerminal}
						/>
					</>
				) : shipView ? (
					<>
						<button
							type="button"
							onClick={() => setShipView(null)}
							className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
						>
							<ArrowLeft className="size-3.5 shrink-0" />
							{shipView === "commit" ? (
								<Trans>Commit</Trans>
							) : (
								<Trans>Create PR</Trans>
							)}
						</button>
						<div className="p-1">
							{shipView === "commit" ? (
								<CommitForm actions={shipActions} />
							) : (
								<CreatePrForm actions={shipActions} />
							)}
						</div>
					</>
				) : (
					<div className="divide-y divide-border">
						{changes && (
							<section className="py-1">
								<ActivityMenuHeader
									title={currentWorkspace.name}
									canCommit={shipMenu.canCommit}
									canPush={shipMenu.canPush}
									canCreatePr={shipMenu.canCreatePr}
									hasCommitsAhead={shipActions.hasCommitsAhead}
									isBusy={shipActions.isShipping || shipActions.isCommitting}
									onOpenView={(view) => {
										if (view === "pr") shipActions.seedPrTitle();
										setShipView(view);
									}}
									onPush={shipActions.push}
									onNoCommitsAhead={() =>
										toast.info(
											t({ message: "No commits to open a pull request from" }),
										)
									}
								/>
								<ChangesMenuRow
									stats={changesStats}
									isOpen={changes.isOpen}
									onToggle={() => {
										changes.onToggle();
										handleOpenChange(false);
									}}
								/>
							</section>
						)}
						<MenuGroup
							title={<Trans>Background processes</Trans>}
							actions={
								stoppableAgentTasks.length > 0 && (
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												aria-label={t({
													message: "Stop all agent background processes",
												})}
												onClick={stopAll}
												className="flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
											>
												<Square className="size-2.5 fill-current" />
											</button>
										</TooltipTrigger>
										<TooltipContent side="top">
											<Trans>Stop all agent background processes</Trans>
										</TooltipContent>
									</Tooltip>
								)
							}
						>
							<div className="max-h-48 overflow-y-auto">
								{processes.length > 0
									? workRows(processes)
									: terminalSessionsQuery.isLoading
										? emptyRow(<Trans>Loading…</Trans>)
										: emptyRow(<Trans>Nothing running</Trans>)}
							</div>
						</MenuGroup>
						{subagents.length > 0 && (
							<MenuGroup title={<Trans>Subagents</Trans>}>
								<div className="max-h-48 overflow-y-auto">
									{workRows(subagents)}
								</div>
							</MenuGroup>
						)}
						<MenuGroup
							title={<Trans>Pages</Trans>}
							addLabel={t({ message: "New page" })}
							onAdd={() => setComposing(true)}
						>
							<div className="max-h-64 overflow-y-auto">
								{workspace.length > 0
									? workspace.map((page) => (
											<PagesMenuRow
												key={page.id}
												page={page}
												onOpen={handleOpenPage}
											/>
										))
									: emptyRow(<Trans>No pages yet</Trans>)}
							</div>
						</MenuGroup>
						{pinned.length > 0 && (
							<MenuGroup title={<Trans>Pinned</Trans>}>
								<div className="max-h-40 overflow-y-auto">
									{pinned.map((page) => (
										<PagesMenuRow
											key={page.id}
											page={page}
											onOpen={handleOpenPage}
										/>
									))}
								</div>
							</MenuGroup>
						)}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
