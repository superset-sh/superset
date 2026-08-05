import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
} from "renderer/stores/workspace-sidebar-state";
import type { PaneStatus } from "shared/tabs-types";
import { create } from "zustand";
import { FIXTURE_NOW, FIXTURE_WORKSPACES } from "../fixtures/workspaces";
import { prBucketFor } from "../model/buildPrototypeView";
import type {
	Direction,
	GroupBy,
	OrderBy,
	PrototypeLinearStatus,
	PrototypeWorkspace,
} from "../model/types";

// Not exported by workspace-sidebar-state — duplicated so the prototype's
// resize behaviour (snap-to-collapse + clamped expanded range) matches exactly.
const MIN_WORKSPACE_SIDEBAR_WIDTH = 220;
const COLLAPSE_THRESHOLD = 120;

/**
 * The collapse key a workspace's group would use under a group-by dimension —
 * must mirror buildPrototypeView's bucket keys.
 */
function groupKeyFor(
	workspace: PrototypeWorkspace,
	groupBy: GroupBy,
): string | null {
	if (groupBy === "repository") return workspace.repo.id;
	if (groupBy === "linear") return workspace.linearStatus?.type ?? "no-status";
	if (groupBy === "agent") return workspace.agentStatus;
	if (groupBy === "pr") return prBucketFor(workspace);
	return null;
}

interface PrototypeState {
	// View config
	groupBy: GroupBy;
	orderBy: OrderBy;
	direction: Direction;
	setGroupBy: (groupBy: GroupBy) => void;
	setOrderBy: (orderBy: OrderBy) => void;
	setDirection: (direction: Direction) => void;

	// Manual ordering: a flat snapshot of workspace ids. Committing one (from a
	// drag, or from picking "Manual" in the dropdown) switches orderBy to manual
	// while leaving groupBy untouched.
	manualOrder: string[];
	commitManualOrder: (order: string[]) => void;

	// Collapsed group headers, keyed "<groupBy>:<groupKey>" so collapsing a
	// repository doesn't also collapse the same-named bucket in another view.
	// (Real sidebar persists isCollapsed on the project/section records.)
	collapsedGroups: Record<string, boolean>;
	toggleGroupCollapsed: (key: string) => void;
	/** Collapse or expand a set of groups at once (the fold-all toggle). */
	setGroupsCollapsed: (keys: string[], collapsed: boolean) => void;

	// The "Projects" panel (view controls + grouped workspace list) collapses
	// as one unit, like the real sidebar's project sections.
	projectsCollapsed: boolean;
	toggleProjectsCollapsed: () => void;

	// The "Groups & ordering" controls row (group/sort dropdowns + direction +
	// fold-all) can be tucked away via the LuLayers toggle on the Projects
	// header once a view is set up.
	viewControlsCollapsed: boolean;
	toggleViewControls: () => void;
	/** Un-tuck the controls row AND the Projects panel (hotkey reveal path). */
	revealViewControls: () => void;

	// Sidebar width, mirroring the real workspace-sidebar-state store: drag
	// resize clamps to [220, 400], dragging below 120 snaps to the 52px rail,
	// and toggling collapse restores the last expanded width.
	sidebarWidth: number;
	lastExpandedWidth: number;
	sidebarResizing: boolean;
	setSidebarWidth: (width: number) => void;
	setSidebarResizing: (resizing: boolean) => void;
	toggleSidebarCollapsed: () => void;

	// Fixture data + virtual clock
	workspaces: PrototypeWorkspace[];
	now: number;
	activeWorkspaceId: string | null;

	// Reorder-flash bookkeeping: which workspace last changed, and a monotonic
	// counter so the same workspace changing twice still re-triggers the flash.
	lastChangedId: string | null;
	changeSeq: number;

	// ⌘J HUD
	hudOpen: boolean;
	setHudOpen: (open: boolean) => void;
	toggleHud: () => void;

	// Navigation
	setActiveWorkspace: (id: string) => void;
	/**
	 * Select a workspace AND expand its group under the current group-by, so a
	 * jump (⌘J HUD) always lands somewhere visible.
	 */
	revealWorkspace: (id: string) => void;

	/**
	 * Re-assign the workspace's Linear status (a cross-group drag while grouped
	 * by Linear status — the board-column semantics). Deliberately no
	 * touchWorkspace: user drags don't trigger the "look here" flash.
	 */
	setLinearStatus: (id: string, status: PrototypeLinearStatus | null) => void;

	// Simulation actions
	setAgentStatus: (id: string, status: PaneStatus) => void;
	finishTurn: (id: string) => void;
	blockOnInput: (id: string) => void;
	bumpActivity: (id: string) => void;
	advanceClock: (minutes: number) => void;
	closeWorkspace: (id: string) => void;
	closePort: (workspaceId: string, port: number) => void;
	reset: () => void;
}

function patchWorkspace(
	workspaces: PrototypeWorkspace[],
	id: string,
	patch: Partial<PrototypeWorkspace>,
): PrototypeWorkspace[] {
	return workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w));
}

/**
 * Stamp a workspace with fresh activity. Each sim event advances the virtual
 * clock by 1s so timestamps are unique and monotonic in click order — without
 * this, two events in a row tie on lastActivityAt and the "Recent" sort falls
 * back to fixture-array order instead of most-recently-touched-first.
 */
function touchWorkspace(
	s: PrototypeState,
	id: string,
	patch: Partial<PrototypeWorkspace>,
) {
	const now = s.now + 1_000;
	return {
		now,
		workspaces: patchWorkspace(s.workspaces, id, {
			...patch,
			lastActivityAt: now,
		}),
		lastChangedId: id,
		changeSeq: s.changeSeq + 1,
	};
}

export const usePrototypeStore = create<PrototypeState>((set) => ({
	groupBy: "repository",
	orderBy: "recent",
	direction: "desc",
	setGroupBy: (groupBy) => set({ groupBy }),
	setOrderBy: (orderBy) => set({ orderBy }),
	setDirection: (direction) => set({ direction }),

	manualOrder: FIXTURE_WORKSPACES.map((w) => w.id),
	// Note: deliberately does NOT bump lastChangedId/changeSeq — a user-driven
	// drag should not trigger the "look here" flash.
	commitManualOrder: (order) => set({ manualOrder: order, orderBy: "manual" }),

	collapsedGroups: {},
	toggleGroupCollapsed: (key) =>
		set((s) => ({
			collapsedGroups: { ...s.collapsedGroups, [key]: !s.collapsedGroups[key] },
		})),

	setGroupsCollapsed: (keys, collapsed) =>
		set((s) => {
			const next = { ...s.collapsedGroups };
			for (const key of keys) next[key] = collapsed;
			return { collapsedGroups: next };
		}),

	projectsCollapsed: false,
	toggleProjectsCollapsed: () =>
		set((s) => ({ projectsCollapsed: !s.projectsCollapsed })),

	viewControlsCollapsed: false,
	toggleViewControls: () =>
		set((s) => ({
			viewControlsCollapsed: !s.viewControlsCollapsed,
			// Revealing the controls must land somewhere visible: if the Projects
			// panel is collapsed, expand it too.
			projectsCollapsed: s.viewControlsCollapsed ? false : s.projectsCollapsed,
		})),

	revealViewControls: () =>
		set({ viewControlsCollapsed: false, projectsCollapsed: false }),

	sidebarWidth: DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	lastExpandedWidth: DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	sidebarResizing: false,

	setSidebarWidth: (width) =>
		set(() => {
			// Snap to collapsed if below threshold (never close completely via drag).
			if (width < COLLAPSE_THRESHOLD) {
				return { sidebarWidth: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH };
			}
			const clamped = Math.max(
				MIN_WORKSPACE_SIDEBAR_WIDTH,
				Math.min(MAX_WORKSPACE_SIDEBAR_WIDTH, width),
			);
			return { sidebarWidth: clamped, lastExpandedWidth: clamped };
		}),

	setSidebarResizing: (sidebarResizing) => set({ sidebarResizing }),

	toggleSidebarCollapsed: () =>
		set((s) =>
			s.sidebarWidth === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH
				? { sidebarWidth: s.lastExpandedWidth }
				: { sidebarWidth: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH },
		),

	workspaces: FIXTURE_WORKSPACES,
	now: FIXTURE_NOW,
	activeWorkspaceId: null,
	lastChangedId: null,
	changeSeq: 0,

	hudOpen: false,
	setHudOpen: (hudOpen) => set({ hudOpen }),
	toggleHud: () => set((s) => ({ hudOpen: !s.hudOpen })),

	setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

	revealWorkspace: (id) =>
		set((s) => {
			const workspace = s.workspaces.find((w) => w.id === id);
			const groupKey = workspace ? groupKeyFor(workspace, s.groupBy) : null;
			const collapseKey = groupKey === null ? null : `${s.groupBy}:${groupKey}`;
			return {
				activeWorkspaceId: id,
				// A jump must land somewhere visible: expand the Projects panel
				// and the target's group if either is collapsed.
				projectsCollapsed: false,
				collapsedGroups:
					collapseKey && s.collapsedGroups[collapseKey]
						? { ...s.collapsedGroups, [collapseKey]: false }
						: s.collapsedGroups,
			};
		}),

	setLinearStatus: (id, linearStatus) =>
		set((s) => ({
			workspaces: patchWorkspace(s.workspaces, id, { linearStatus }),
		})),

	setAgentStatus: (id, status) =>
		set((s) => touchWorkspace(s, id, { agentStatus: status })),

	finishTurn: (id) =>
		set((s) => touchWorkspace(s, id, { agentStatus: "review" })),

	blockOnInput: (id) =>
		set((s) => touchWorkspace(s, id, { agentStatus: "permission" })),

	bumpActivity: (id) => set((s) => touchWorkspace(s, id, {})),

	advanceClock: (minutes) => set((s) => ({ now: s.now + minutes * 60_000 })),

	closeWorkspace: (id) =>
		set((s) => ({
			workspaces: s.workspaces.filter((w) => w.id !== id),
			manualOrder: s.manualOrder.filter((wsId) => wsId !== id),
			activeWorkspaceId:
				s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
			lastChangedId: s.lastChangedId === id ? null : s.lastChangedId,
		})),

	closePort: (workspaceId, port) =>
		set((s) => ({
			workspaces: s.workspaces.map((w) =>
				w.id === workspaceId
					? { ...w, ports: w.ports.filter((p) => p.port !== port) }
					: w,
			),
		})),

	reset: () =>
		set({
			workspaces: FIXTURE_WORKSPACES,
			manualOrder: FIXTURE_WORKSPACES.map((w) => w.id),
			collapsedGroups: {},
			now: FIXTURE_NOW,
			activeWorkspaceId: null,
			hudOpen: false,
			lastChangedId: null,
			changeSeq: 0,
		}),
}));
