import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { useMatchRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuLayers,
	LuSearchX,
} from "react-icons/lu";
import { BoardColumnIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/BoardColumnIcon";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	DEVICE_FILTER_THIS_DEVICE,
	useV2WorkspacesFilterStore,
	type V2WorkspacesArchivedWindow,
	type V2WorkspacesSortMode,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { isWithinArchivedWindow } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/archivedWindow";
import {
	BOARD_COLUMN_LABELS,
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
	deriveBoardColumn,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";
import { compareWorkspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/sortWorkspaces";
import { useV2ProjectLocalMetaStore } from "renderer/stores/v2-project-local-meta";
import { V2WorkspaceRow } from "./components/V2WorkspaceRow";

interface V2WorkspacesListProps {
	workspaces: AccessibleV2Workspace[];
	isReady: boolean;
}

interface StatusSection {
	column: BoardColumnKey;
	workspaces: AccessibleV2Workspace[];
}

/** Board order reads left-to-right along the workflow; a vertical list must
 * lead with what needs the user, so it walks the same buckets urgency-first. */
const LIST_SECTION_ORDER: BoardColumnKey[] = [
	"attention",
	"working",
	"review",
	"idle",
	"merged",
	"deleted",
];

/** Same buckets as the board — the two views must agree on what
 * "needs attention" means. Row order inside a section follows the user's
 * sort mode. */
function groupByStatus(
	workspaces: AccessibleV2Workspace[],
	archivedWindow: V2WorkspacesArchivedWindow,
	sortMode: V2WorkspacesSortMode,
): StatusSection[] {
	const now = Date.now();
	const byColumn = new Map<BoardColumnKey, AccessibleV2Workspace[]>(
		BOARD_COLUMN_ORDER.map((column) => [column, []]),
	);
	for (const workspace of workspaces) {
		if (
			workspace.archivedAt != null &&
			!isWithinArchivedWindow(workspace.archivedAt, archivedWindow, now)
		) {
			continue;
		}
		byColumn.get(deriveBoardColumn(workspace))?.push(workspace);
	}
	const sections: StatusSection[] = [];
	for (const column of LIST_SECTION_ORDER) {
		const rows = byColumn.get(column) ?? [];
		if (rows.length === 0) continue;
		rows.sort((a, b) => compareWorkspaces(a, b, sortMode));
		sections.push({ column, workspaces: rows });
	}
	return sections;
}

export function V2WorkspacesList({
	workspaces,
	isReady,
}: V2WorkspacesListProps) {
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;

	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const deviceFilter = useV2WorkspacesFilterStore(
		(state) => state.deviceFilter,
	);
	const projectFilters = useV2WorkspacesFilterStore(
		(state) => state.projectFilters,
	);
	const prStateFilters = useV2WorkspacesFilterStore(
		(state) => state.prStateFilters,
	);
	const agentStatusFilters = useV2WorkspacesFilterStore(
		(state) => state.agentStatusFilters,
	);
	const pinFilter = useV2WorkspacesFilterStore((state) => state.pinFilter);
	const resetFilters = useV2WorkspacesFilterStore((state) => state.reset);
	const archivedWindow = useV2WorkspacesFilterStore(
		(state) => state.archivedWindow,
	);
	const sortMode = useV2WorkspacesFilterStore((state) => state.sortMode);

	const sections = useMemo(
		() => groupByStatus(workspaces, archivedWindow, sortMode),
		[workspaces, archivedWindow, sortMode],
	);

	const hasActiveFilters =
		searchQuery.trim() !== "" ||
		deviceFilter !== DEVICE_FILTER_THIS_DEVICE ||
		projectFilters.length > 0 ||
		prStateFilters.length > 0 ||
		agentStatusFilters.length > 0 ||
		pinFilter !== "all" ||
		// A narrowed archive window can hide every row (e.g. all tombstones
		// with "Hide archived") — that's a filter, not an empty account.
		archivedWindow !== "none";

	// Sections, not the input rows: the archived window can drop everything.
	if (sections.length === 0) {
		// A host that hasn't answered yet must not read as empty (cache-first rule).
		if (!isReady) return <div className="min-h-0 flex-1" />;
		return (
			<Empty className="flex-1 border-0">
				<EmptyHeader>
					<EmptyMedia
						variant="icon"
						className="size-14 [&_svg:not([class*='size-'])]:size-7"
					>
						{hasActiveFilters ? <LuSearchX /> : <LuLayers />}
					</EmptyMedia>
					<EmptyTitle>
						{hasActiveFilters ? (
							<Trans>No workspaces match your filters</Trans>
						) : (
							<Trans>No workspaces yet</Trans>
						)}
					</EmptyTitle>
					<EmptyDescription>
						{hasActiveFilters ? (
							<Trans>Try a different search term or another device.</Trans>
						) : (
							<Trans>Workspaces on this device will show up here.</Trans>
						)}
					</EmptyDescription>
				</EmptyHeader>
				{hasActiveFilters ? (
					<EmptyContent>
						<Button variant="outline" size="sm" onClick={() => resetFilters()}>
							<Trans>Clear filters</Trans>
						</Button>
					</EmptyContent>
				) : null}
			</Empty>
		);
	}

	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			{sections.map((section) => (
				<StatusSectionGroup
					key={section.column}
					section={section}
					currentWorkspaceId={currentWorkspaceId}
				/>
			))}
		</div>
	);
}

interface StatusSectionGroupProps {
	section: StatusSection;
	currentWorkspaceId: string | null;
}

function StatusSectionGroup({
	section,
	currentWorkspaceId,
}: StatusSectionGroupProps) {
	// Reuses the project-collapse store with a status-scoped key; the key set
	// is fixed (six columns), so the persisted map stays bounded.
	const collapseKey = `status:${section.column}`;
	const persistedCollapsed = useV2ProjectLocalMetaStore(
		(state) => state.projects[collapseKey]?.isCollapsed ?? false,
	);
	const toggleCollapsed = useV2ProjectLocalMetaStore(
		(state) => state.toggleProjectCollapsed,
	);
	const containsCurrent = section.workspaces.some(
		(workspace) => workspace.id === currentWorkspaceId,
	);
	// The current workspace's section never hides, so its toggle is inert —
	// disable it instead of letting clicks appear to do nothing.
	const isCollapsed = persistedCollapsed && !containsCurrent;
	const Chevron = isCollapsed ? LuChevronRight : LuChevronDown;
	const rowsId = `v2-workspaces-status-${section.column}-rows`;

	return (
		<section>
			{/* A tinted band + uppercase micro-label (same vocabulary as the
			    sidebar's SESSIONS/PROJECTS headers) so groups never read as
			    rows; the dot keeps the row-glyph column alignment. */}
			<button
				type="button"
				onClick={() => toggleCollapsed(collapseKey)}
				disabled={containsCurrent}
				title={
					containsCurrent
						? "Can't collapse the current workspace's section"
						: undefined
				}
				aria-expanded={!isCollapsed}
				aria-controls={rowsId}
				className="sticky top-0 z-[5] flex w-full items-center gap-2 border-b border-border/60 bg-muted/70 px-6 py-1.5 text-left outline-none backdrop-blur transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
			>
				{/* Disclosure lives in the left padding gutter so the status icon
				    stays locked to the row-glyph column. */}
				<Chevron className="absolute left-1.5 size-3 shrink-0 text-muted-foreground/60" />
				<span
					aria-hidden
					className="flex size-4 shrink-0 items-center justify-center"
				>
					<BoardColumnIcon column={section.column} />
				</span>
				<h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					{i18n._(BOARD_COLUMN_LABELS[section.column])}
				</h3>
				<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
					{section.workspaces.length}
				</span>
			</button>
			<div id={rowsId}>
				{isCollapsed
					? null
					: section.workspaces.map((workspace) => (
							<V2WorkspaceRow
								key={workspace.id}
								workspace={workspace}
								isCurrentRoute={workspace.id === currentWorkspaceId}
							/>
						))}
			</div>
		</section>
	);
}
