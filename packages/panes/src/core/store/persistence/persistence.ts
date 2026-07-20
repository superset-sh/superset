import type { LayoutNode, Pane, Tab, WorkspaceState } from "../../../types";

/**
 * The persisted-state contract for a workspace, owned by this package so the
 * shape can't drift from `WorkspaceState`. Consumers persist the result of
 * `toWorkspaceState` and heal reads with `sanitizeWorkspaceState`.
 *
 * `Required<...>` is load-bearing: adding an optional field to
 * `WorkspaceState` breaks compilation here until both functions carry it,
 * instead of the field silently vanishing across a restart.
 */
export type PersistedWorkspaceState<TData> = Required<WorkspaceState<TData>>;

/** Snapshot of the persistable fields of a (super)state, ready to store */
export function toWorkspaceState<TData>(
	state: WorkspaceState<TData>,
): PersistedWorkspaceState<TData> {
	return {
		version: state.version,
		tabs: state.tabs,
		activeTabId: state.activeTabId,
		panelLayout: state.panelLayout ?? null,
		panelActiveTabIds: state.panelActiveTabIds ?? {},
	};
}

function emptyState(): PersistedWorkspaceState<unknown> {
	return {
		version: 1,
		tabs: [],
		activeTabId: null,
		panelLayout: null,
		panelActiveTabIds: {},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeLayoutNode(raw: unknown): LayoutNode | null {
	if (!isRecord(raw)) return null;
	if (raw.type === "pane") {
		return typeof raw.paneId === "string"
			? { type: "pane", paneId: raw.paneId }
			: null;
	}
	if (raw.type === "split") {
		if (raw.direction !== "horizontal" && raw.direction !== "vertical") {
			return null;
		}
		const first = sanitizeLayoutNode(raw.first);
		const second = sanitizeLayoutNode(raw.second);
		if (!first || !second) return null;
		const node: LayoutNode = {
			type: "split",
			direction: raw.direction,
			first,
			second,
		};
		if (typeof raw.splitPercentage === "number") {
			node.splitPercentage = raw.splitPercentage;
		}
		return node;
	}
	return null;
}

function sanitizePane(raw: unknown): Pane<unknown> | null {
	if (!isRecord(raw)) return null;
	if (typeof raw.id !== "string" || typeof raw.kind !== "string") return null;
	const pane: Pane<unknown> = { id: raw.id, kind: raw.kind, data: raw.data };
	if (typeof raw.titleOverride === "string") {
		pane.titleOverride = raw.titleOverride;
	}
	if (typeof raw.pinned === "boolean") pane.pinned = raw.pinned;
	return pane;
}

/** Null when the tab is structurally corrupt (caller drops it) */
function sanitizeTab(raw: unknown): Tab<unknown> | null {
	if (!isRecord(raw)) return null;
	if (typeof raw.id !== "string" || typeof raw.createdAt !== "number") {
		return null;
	}
	if (raw.activePaneId !== null && typeof raw.activePaneId !== "string") {
		return null;
	}
	const layout = sanitizeLayoutNode(raw.layout);
	if (!layout || !isRecord(raw.panes)) return null;

	const panes: Record<string, Pane<unknown>> = {};
	for (const [paneId, rawPane] of Object.entries(raw.panes)) {
		const pane = sanitizePane(rawPane);
		if (!pane) return null;
		panes[paneId] = pane;
	}

	const tab: Tab<unknown> = {
		id: raw.id,
		createdAt: raw.createdAt,
		activePaneId: raw.activePaneId,
		layout,
		panes,
	};
	if (typeof raw.titleOverride === "string") {
		tab.titleOverride = raw.titleOverride;
	}
	if (typeof raw.panelId === "string") tab.panelId = raw.panelId;
	return tab;
}

/**
 * Read-time heal for a persisted workspace state. An unparseable top-level
 * shape resets to empty; individually-corrupt tabs (e.g. a split node missing
 * a child) are dropped while valid tabs are kept, and `activeTabId` is
 * repaired to point at a surviving tab. Malformed panel fields fall back to
 * the implicit single panel — the store self-repairs the rest on read.
 * Never throws.
 */
export function sanitizeWorkspaceState(
	raw: unknown,
): PersistedWorkspaceState<unknown> {
	if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.tabs)) {
		return emptyState();
	}

	const tabs = raw.tabs.flatMap((tab): Tab<unknown>[] => {
		const sanitized = sanitizeTab(tab);
		return sanitized ? [sanitized] : [];
	});
	const activeTabId =
		typeof raw.activeTabId === "string" &&
		tabs.some((tab) => tab.id === raw.activeTabId)
			? raw.activeTabId
			: (tabs[0]?.id ?? null);

	const panelLayout =
		raw.panelLayout == null ? null : sanitizeLayoutNode(raw.panelLayout);

	let panelActiveTabIds: Record<string, string> = {};
	if (isRecord(raw.panelActiveTabIds)) {
		const entries = Object.entries(raw.panelActiveTabIds);
		if (entries.every(([, tabId]) => typeof tabId === "string")) {
			panelActiveTabIds = Object.fromEntries(entries) as Record<string, string>;
		}
	}

	return { version: 1, tabs, activeTabId, panelLayout, panelActiveTabIds };
}
