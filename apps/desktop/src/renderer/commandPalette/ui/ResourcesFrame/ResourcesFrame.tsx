import {
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { cn } from "@superset/ui/utils";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineChevronDown, HiOutlineChevronRight } from "react-icons/hi2";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { ResourceMetricsSummary } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/components/ResourceMetricsSummary";
import { UsageSeverityBadge } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/components/UsageSeverityBadge";
import { useResourceNavigation } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/hooks/useResourceNavigation";
import { useResourceSnapshot } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/hooks/useResourceSnapshot";
import type { WorkspaceMetrics } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/types";
import {
	formatCpu,
	formatMemory,
} from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/utils/formatters";
import { getUsageSeverity } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/utils/resourceSeverity";
import { useFrameStackStore } from "../../core/frames";
import { useCommandPaletteQuery } from "../CommandPalette/CommandPalette";

const ROW_CLASS = "gap-2 !py-2.5 text-sm";
const METRIC_COLS =
	"flex shrink-0 items-center tabular-nums tracking-tight justify-end";
const CPU_COL = "w-14 text-right";
const MEM_COL = "w-16 text-right";
const WORKSPACE_ID_ATTR = "data-resources-workspace-id";

interface ResourceRow {
	workspace: WorkspaceMetrics;
	sessions: WorkspaceMetrics["sessions"];
	/** Expanded because the query matched one of its terminals. */
	forceExpanded: boolean;
}

export function ResourcesFrame() {
	const rawQuery = useCommandPaletteQuery();
	const query = rawQuery.trim().toLowerCase();
	const isV2 = useIsV2CloudEnabled();
	const surface = isV2 ? "v2" : "v1";
	const setOpen = useFrameStackStore((s) => s.setOpen);

	const { snapshot } = useResourceSnapshot(surface);
	const { getPaneName, navigateToWorkspace, navigateToPane } =
		useResourceNavigation({ surface, onNavigate: () => setOpen(false) });

	const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
		new Set(),
	);

	const queryRef = useRef(query);
	useEffect(() => {
		queryRef.current = query;
	}, [query]);

	// cmdk keeps focus in the search input, so ←/→ never reach the list items.
	// While the query is empty (arrows have no caret to move), toggle the
	// highlighted workspace instead.
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
			if (queryRef.current) return;
			const selected = document.querySelector(
				'[cmdk-item][data-selected="true"]',
			);
			const workspaceId = selected?.getAttribute(WORKSPACE_ID_ATTR);
			if (!workspaceId) return;
			event.preventDefault();
			event.stopPropagation();
			setExpandedIds((previous) => {
				const next = new Set(previous);
				if (event.key === "ArrowRight") {
					next.add(workspaceId);
				} else {
					next.delete(workspaceId);
				}
				return next;
			});
		};
		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, []);

	const rows = useMemo<ResourceRow[]>(() => {
		if (!snapshot) return [];
		const sorted = [...snapshot.workspaces].sort((a, b) => b.memory - a.memory);
		if (!query) {
			return sorted.map((workspace) => ({
				workspace,
				sessions: workspace.sessions,
				forceExpanded: false,
			}));
		}
		return sorted.flatMap((workspace) => {
			const workspaceMatches =
				workspace.workspaceName.toLowerCase().includes(query) ||
				workspace.projectName.toLowerCase().includes(query);
			const matchingSessions = workspace.sessions.filter((session) =>
				getPaneName(session).toLowerCase().includes(query),
			);
			if (!workspaceMatches && matchingSessions.length === 0) return [];
			return [
				{
					workspace,
					sessions: workspaceMatches ? workspace.sessions : matchingSessions,
					forceExpanded: matchingSessions.length > 0,
				},
			];
		});
	}, [snapshot, query, getPaneName]);

	const totals = {
		cpu: snapshot?.totalCpu ?? 0,
		memory: snapshot?.totalMemory ?? 0,
	};

	const toggleWorkspace = (workspaceId: string) => {
		setExpandedIds((previous) => {
			const next = new Set(previous);
			if (next.has(workspaceId)) {
				next.delete(workspaceId);
			} else {
				next.add(workspaceId);
			}
			return next;
		});
	};

	return (
		<>
			{snapshot && (
				<div className="border-b border-border/60 px-3.5 pt-3 pb-3">
					<ResourceMetricsSummary snapshot={snapshot} />
				</div>
			)}
			<CommandList>
				<CommandEmpty>
					{snapshot ? "No matching workspaces." : "Measuring resource usage…"}
				</CommandEmpty>
				{rows.length > 0 && (
					<CommandGroup heading="Workspaces · by memory">
						{rows.map(({ workspace, sessions, forceExpanded }) => {
							const isExpanded =
								forceExpanded || expandedIds.has(workspace.workspaceId);
							const hasSessions = sessions.length > 0;

							return (
								<Fragment key={workspace.workspaceId}>
									<CommandItem
										value={`resources ${workspace.workspaceId}`}
										{...{ [WORKSPACE_ID_ATTR]: workspace.workspaceId }}
										onSelect={() => navigateToWorkspace(workspace.workspaceId)}
										className={ROW_CLASS}
									>
										{hasSessions ? (
											<button
												type="button"
												onClick={(event) => {
													event.preventDefault();
													event.stopPropagation();
													toggleWorkspace(workspace.workspaceId);
												}}
												aria-label={
													isExpanded ? "Collapse workspace" : "Expand workspace"
												}
												aria-expanded={isExpanded}
												className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
											>
												{isExpanded ? (
													<HiOutlineChevronDown className="!size-3.5" />
												) : (
													<HiOutlineChevronRight className="!size-3.5" />
												)}
											</button>
										) : (
											<span className="size-5 shrink-0" />
										)}
										<span className="min-w-0 flex-1 truncate">
											{workspace.workspaceName}
										</span>
										<span className="max-w-32 shrink-0 truncate text-muted-foreground text-xs">
											{workspace.projectName}
										</span>
										<UsageSeverityBadge
											severity={getUsageSeverity(workspace, totals)}
										/>
										<span
											className={cn(METRIC_COLS, "text-foreground/85 text-xs")}
										>
											<span className={CPU_COL}>
												{formatCpu(workspace.cpu)}
											</span>
											<span className={MEM_COL}>
												{formatMemory(workspace.memory)}
											</span>
										</span>
									</CommandItem>

									{isExpanded &&
										sessions.map((session) => (
											<CommandItem
												key={session.sessionId}
												value={`resources ${workspace.workspaceId} ${session.sessionId}`}
												{...{ [WORKSPACE_ID_ATTR]: workspace.workspaceId }}
												onSelect={() =>
													navigateToPane(workspace.workspaceId, session.paneId)
												}
												className={cn(ROW_CLASS, "!py-2")}
											>
												<span className="w-5 shrink-0" />
												<span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
												<span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
													{getPaneName(session)}
												</span>
												<UsageSeverityBadge
													severity={getUsageSeverity(session, workspace)}
												/>
												<span
													className={cn(
														METRIC_COLS,
														"text-muted-foreground/80 text-xs",
													)}
												>
													<span className={CPU_COL}>
														{formatCpu(session.cpu)}
													</span>
													<span className={MEM_COL}>
														{formatMemory(session.memory)}
													</span>
												</span>
											</CommandItem>
										))}
								</Fragment>
							);
						})}
					</CommandGroup>
				)}
			</CommandList>
			<div className="flex items-center gap-4 border-t border-border/60 px-3.5 py-2 text-[11px] text-muted-foreground">
				<span>→ expand</span>
				<span>← collapse</span>
				<span>↵ open workspace / jump to terminal</span>
			</div>
		</>
	);
}
