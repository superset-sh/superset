import type { WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
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
import { Archive, ChevronDown, Trash2 } from "lucide-react";
import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import {
	logStressEvent,
	useRenderStressInstrumentation,
} from "renderer/lib/performance/stress-instrumentation";
import {
	clearTerminalBackgroundMarker,
	getTerminalBackgroundMarkerIdsKey,
	subscribeTerminalBackgroundMarkers,
} from "renderer/lib/terminal/terminal-background-intents";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import {
	BACKGROUND_TERMINAL_ATTACHMENT_DEBOUNCE_MS,
	getAttachedTerminalIdsKey,
	getBackgroundTerminalCountRefetchInterval,
	getBackgroundTerminalListRefetchInterval,
	getBackgroundTerminalSessions,
	getUnattachedTerminalIds,
	parseAttachedTerminalIdsKey,
} from "./BackgroundTerminalsButton.utils";

interface BackgroundTerminalsButtonProps {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

/**
 * Tab-bar control that surfaces running terminal daemon sessions for the
 * workspace that have no pane attached (e.g. moved to background via the
 * terminal pane header). Renders nothing when there are none; otherwise a
 * single button with a dropdown to re-open or kill each background session.
 */
export const BackgroundTerminalsButton = memo(
	function BackgroundTerminalsButton({
		workspaceId,
		store,
	}: BackgroundTerminalsButtonProps) {
		const [isOpen, setIsOpen] = useState(false);
		const attachedTerminalIdsKey = useStore(store, (s) =>
			getAttachedTerminalIdsKey(s.tabs),
		);
		const debouncedAttachedTerminalIdsKey = useDebouncedValue(
			attachedTerminalIdsKey,
			BACKGROUND_TERMINAL_ATTACHMENT_DEBOUNCE_MS,
		);
		const attachedTerminalIds = useMemo(
			() => parseAttachedTerminalIdsKey(attachedTerminalIdsKey),
			[attachedTerminalIdsKey],
		);
		const getBackgroundMarkerSnapshot = useCallback(
			() => getTerminalBackgroundMarkerIdsKey(workspaceId),
			[workspaceId],
		);
		const backgroundMarkerIdsKey = useSyncExternalStore(
			subscribeTerminalBackgroundMarkers,
			getBackgroundMarkerSnapshot,
			() => "[]",
		);
		const backgroundMarkerIds = useMemo(
			() => parseAttachedTerminalIdsKey(backgroundMarkerIdsKey),
			[backgroundMarkerIdsKey],
		);
		const debouncedAttachedTerminalIds = useMemo(
			() => parseAttachedTerminalIdsKey(debouncedAttachedTerminalIdsKey),
			[debouncedAttachedTerminalIdsKey],
		);
		const optimisticBackgroundTerminalIds = useMemo(
			() => getUnattachedTerminalIds(backgroundMarkerIds, attachedTerminalIds),
			[backgroundMarkerIds, attachedTerminalIds],
		);
		const optimisticBackgroundCount = optimisticBackgroundTerminalIds.length;
		const backgroundCountInput = useMemo(
			() => ({
				workspaceId,
				attachedTerminalIds: debouncedAttachedTerminalIds,
			}),
			[workspaceId, debouncedAttachedTerminalIds],
		);
		const sessionsInput = useMemo(() => ({ workspaceId }), [workspaceId]);
		const utils = workspaceTrpc.useUtils();
		const killSession = workspaceTrpc.terminal.killSession.useMutation();
		const backgroundCountQuery =
			workspaceTrpc.terminal.countBackgroundSessions.useQuery(
				backgroundCountInput,
				{
					enabled: !isOpen,
					notifyOnChangeProps: ["data", "dataUpdatedAt"],
					refetchInterval: getBackgroundTerminalCountRefetchInterval(isOpen),
					refetchOnWindowFocus: false,
					staleTime: 5_000,
				},
			);
		const sessionsQuery = workspaceTrpc.terminal.listSessions.useQuery(
			sessionsInput,
			{
				enabled: isOpen,
				notifyOnChangeProps: ["data", "isLoading"],
				refetchInterval: getBackgroundTerminalListRefetchInterval(isOpen),
				refetchOnWindowFocus: isOpen,
				staleTime: 1_000,
			},
		);

		useRenderStressInstrumentation("BackgroundTerminalsButton", {
			warnAt: 35,
			getDetails: () => ({
				isOpen,
				attachedTerminalCount: attachedTerminalIds.length,
				optimisticBackgroundCount,
				closedCount: backgroundCountQuery.data?.count ?? null,
			}),
		});

		const backgroundSessions = useMemo(() => {
			const sessions = sessionsQuery.data?.sessions ?? [];
			return getBackgroundTerminalSessions(sessions, attachedTerminalIds);
		}, [sessionsQuery.data?.sessions, attachedTerminalIds]);

		const markerObservedAtRef = useRef(0);
		useEffect(() => {
			markerObservedAtRef.current =
				backgroundMarkerIdsKey === "[]" ? 0 : Date.now();
		}, [backgroundMarkerIdsKey]);

		useEffect(() => {
			if (!sessionsQuery.data) return;

			const actualBackgroundTerminalIds = new Set(
				backgroundSessions.map((session) => session.terminalId),
			);
			for (const terminalId of backgroundMarkerIds) {
				if (actualBackgroundTerminalIds.has(terminalId)) continue;
				clearTerminalBackgroundMarker(workspaceId, terminalId);
			}
		}, [
			backgroundMarkerIds,
			backgroundSessions,
			sessionsQuery.data,
			workspaceId,
		]);

		useEffect(() => {
			if (isOpen || optimisticBackgroundTerminalIds.length === 0) return;
			if (debouncedAttachedTerminalIdsKey !== attachedTerminalIdsKey) return;
			if (backgroundCountQuery.data?.count !== 0) return;
			if (backgroundCountQuery.dataUpdatedAt <= markerObservedAtRef.current) {
				return;
			}

			for (const terminalId of optimisticBackgroundTerminalIds) {
				clearTerminalBackgroundMarker(workspaceId, terminalId);
			}
		}, [
			attachedTerminalIdsKey,
			backgroundCountQuery.data?.count,
			backgroundCountQuery.dataUpdatedAt,
			debouncedAttachedTerminalIdsKey,
			isOpen,
			optimisticBackgroundTerminalIds,
			workspaceId,
		]);

		const backgroundCount =
			isOpen && sessionsQuery.data
				? backgroundSessions.length
				: Math.max(
						backgroundCountQuery.data?.count ?? 0,
						optimisticBackgroundCount,
					);

		if (!isOpen && backgroundCount === 0) return null;

		const label = `${backgroundCount} background terminal session${
			backgroundCount === 1 ? "" : "s"
		}`;

		const handleAdopt = (terminalId: string) => {
			clearTerminalBackgroundMarker(workspaceId, terminalId);
			store.getState().addTab({
				panes: [
					{
						kind: "terminal",
						data: { terminalId } as TerminalPaneData,
					},
				],
			});
			void utils.terminal.listSessions.invalidate({ workspaceId });
			void utils.terminal.countBackgroundSessions.invalidate({ workspaceId });
			logStressEvent("background-terminals.adopt", { workspaceId });
			setIsOpen(false);
		};

		const handleKill = async (terminalId: string) => {
			try {
				await killSession.mutateAsync({ terminalId, workspaceId });
				clearTerminalBackgroundMarker(workspaceId, terminalId);
			} catch (error) {
				console.error(
					"[BackgroundTerminalsButton] Failed to kill session:",
					error,
				);
				toast.error("Failed to close terminal session");
			} finally {
				void utils.terminal.listSessions.invalidate({ workspaceId });
				void utils.terminal.countBackgroundSessions.invalidate({ workspaceId });
			}
		};

		return (
			<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						className="h-7 gap-1 rounded-md border border-border/60 bg-muted/30 px-2 text-xs text-muted-foreground shadow-none hover:bg-accent/60 hover:text-foreground"
						size="sm"
						type="button"
						variant="ghost"
					>
						<Archive className="size-3.5" />
						<span>{label}</span>
						<ChevronDown className="size-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-80">
					<DropdownMenuLabel className="text-xs">
						Background terminal sessions
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<div className="max-h-80 overflow-y-auto">
						{sessionsQuery.isLoading && (
							<div className="px-2 py-3 text-xs text-muted-foreground">
								Loading sessions…
							</div>
						)}
						{!sessionsQuery.isLoading && backgroundSessions.length === 0 && (
							<div className="px-2 py-3 text-xs text-muted-foreground">
								No background terminal sessions
							</div>
						)}
						{backgroundSessions.map((session) => (
							<DropdownMenuItem
								key={session.terminalId}
								className="group flex items-center gap-2"
								onSelect={() => handleAdopt(session.terminalId)}
							>
								<Archive className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="min-w-0 flex-1 truncate text-xs">
									{session.title ?? "Terminal"}
								</span>
								{session.createdAt > 0 && (
									<span className="shrink-0 text-xs text-muted-foreground/70">
										{getRelativeTime(session.createdAt, { format: "compact" })}
									</span>
								)}
								<button
									type="button"
									aria-label="Close terminal session"
									title="Close terminal session"
									disabled={
										killSession.isPending &&
										killSession.variables?.terminalId === session.terminalId
									}
									className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 group-hover:opacity-100"
									onClick={(event) => {
										event.preventDefault();
										event.stopPropagation();
										void handleKill(session.terminalId);
									}}
								>
									<Trash2 className="size-3" />
								</button>
							</DropdownMenuItem>
						))}
					</div>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	},
	areBackgroundTerminalsButtonPropsEqual,
);

function areBackgroundTerminalsButtonPropsEqual(
	prev: BackgroundTerminalsButtonProps,
	next: BackgroundTerminalsButtonProps,
) {
	return prev.workspaceId === next.workspaceId && prev.store === next.store;
}
