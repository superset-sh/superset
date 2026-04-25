import type { Pane, Tab } from "@superset/panes";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
} from "shared/tabs-types";
import { create } from "zustand";

export type V2NotificationPaneLike = Pick<Pane<unknown>, "kind" | "data">;
export type V2NotificationTabLike = Pick<Tab<unknown>, "panes">;

export interface V2NotificationSource {
	sourceId: string;
	terminalId: string;
	workspaceId: string;
	status: ActivePaneStatus;
	occurredAt: number;
}

export interface V2NotificationState {
	sources: Record<string, V2NotificationSource>;
	setTerminalStatus: (
		terminalId: string,
		workspaceId: string,
		status: ActivePaneStatus,
		occurredAt?: number,
	) => void;
	clearSourceStatus: (sourceId: string, workspaceId?: string) => void;
	clearSourceStatuses: (
		sourceIds: Iterable<string>,
		workspaceId?: string,
	) => void;
	clearSourceAttention: (sourceId: string, workspaceId?: string) => void;
	clearWorkspaceStatuses: (workspaceId: string) => void;
	clearWorkspaceAttention: (workspaceId: string) => void;
}

export const useV2NotificationStore = create<V2NotificationState>()((set) => ({
	sources: {},
	setTerminalStatus: (
		terminalId,
		workspaceId,
		status,
		occurredAt = Date.now(),
	) => {
		set((state) => ({
			sources: {
				...state.sources,
				[terminalId]: {
					sourceId: terminalId,
					terminalId,
					workspaceId,
					status,
					occurredAt,
				},
			},
		}));
	},
	clearSourceStatus: (sourceId, workspaceId) => {
		set((state) => {
			const source = state.sources[sourceId];
			if (!source || (workspaceId && source.workspaceId !== workspaceId)) {
				return state;
			}
			const { [sourceId]: _removed, ...sources } = state.sources;
			return { sources };
		});
	},
	clearSourceStatuses: (sourceIds, workspaceId) => {
		set((state) => {
			const ids = new Set(sourceIds);
			const sources: Record<string, V2NotificationSource> = {};
			let changed = false;
			for (const [sourceId, source] of Object.entries(state.sources)) {
				if (
					ids.has(sourceId) &&
					(!workspaceId || source.workspaceId === workspaceId)
				) {
					changed = true;
					continue;
				}
				sources[sourceId] = source;
			}
			return changed ? { sources } : state;
		});
	},
	clearSourceAttention: (sourceId, workspaceId) => {
		set((state) => {
			const source = state.sources[sourceId];
			if (
				!source ||
				source.status !== "review" ||
				(workspaceId && source.workspaceId !== workspaceId)
			) {
				return state;
			}
			const { [sourceId]: _removed, ...sources } = state.sources;
			return { sources };
		});
	},
	clearWorkspaceStatuses: (workspaceId) => {
		set((state) => {
			const sources: Record<string, V2NotificationSource> = {};
			let changed = false;
			for (const [sourceId, source] of Object.entries(state.sources)) {
				if (source.workspaceId === workspaceId) {
					changed = true;
					continue;
				}
				sources[sourceId] = source;
			}
			return changed ? { sources } : state;
		});
	},
	clearWorkspaceAttention: (workspaceId) => {
		set((state) => {
			const sources: Record<string, V2NotificationSource> = {};
			let changed = false;
			for (const [sourceId, source] of Object.entries(state.sources)) {
				if (source.workspaceId === workspaceId && source.status === "review") {
					changed = true;
					continue;
				}
				sources[sourceId] = source;
			}
			return changed ? { sources } : state;
		});
	},
}));

export function getV2NotificationSourceIdsForPane(
	pane: V2NotificationPaneLike | null | undefined,
): string[] {
	const terminalId = getTerminalIdForPane(pane);
	return terminalId ? [terminalId] : [];
}

export function getV2NotificationSourceIdsForTab(
	tab: V2NotificationTabLike | null | undefined,
): string[] {
	if (!tab) return [];
	const sourceIds = new Set<string>();
	for (const pane of Object.values(tab.panes)) {
		for (const sourceId of getV2NotificationSourceIdsForPane(pane)) {
			sourceIds.add(sourceId);
		}
	}
	return [...sourceIds];
}

export function selectV2WorkspaceNotificationStatus(workspaceId: string) {
	return (state: V2NotificationState) => {
		function* statuses() {
			for (const source of Object.values(state.sources)) {
				if (source.workspaceId === workspaceId) {
					yield source.status;
				}
			}
		}
		return getHighestPriorityStatus(statuses());
	};
}

export function selectV2TabNotificationStatus(
	workspaceId: string,
	tab: V2NotificationTabLike | null | undefined,
) {
	const sourceIds = getV2NotificationSourceIdsForTab(tab);
	return selectV2SourceIdsNotificationStatus(workspaceId, sourceIds);
}

export function selectV2PaneNotificationStatus(
	workspaceId: string,
	pane: V2NotificationPaneLike | null | undefined,
) {
	const sourceIds = getV2NotificationSourceIdsForPane(pane);
	return selectV2SourceIdsNotificationStatus(workspaceId, sourceIds);
}

export function selectV2TerminalNotificationStatus(
	workspaceId: string,
	terminalId: string | null | undefined,
) {
	return selectV2SourceIdsNotificationStatus(
		workspaceId,
		terminalId ? [terminalId] : [],
	);
}

export function selectV2SourceIdsNotificationStatus(
	workspaceId: string,
	sourceIds: Iterable<string>,
) {
	const sourceIdList = [...new Set(sourceIds)];
	return (state: V2NotificationState) =>
		selectStatusForSourceIds(state, workspaceId, sourceIdList);
}

export function useV2WorkspaceNotificationStatus(workspaceId: string) {
	return useV2NotificationStore(
		selectV2WorkspaceNotificationStatus(workspaceId),
	);
}

export function useV2TabNotificationStatus(
	workspaceId: string,
	tab: V2NotificationTabLike | null | undefined,
) {
	return useV2NotificationStore(
		selectV2TabNotificationStatus(workspaceId, tab),
	);
}

export function useV2PaneNotificationStatus(
	workspaceId: string,
	pane: V2NotificationPaneLike | null | undefined,
) {
	return useV2NotificationStore(
		selectV2PaneNotificationStatus(workspaceId, pane),
	);
}

export function useV2TerminalNotificationStatus(
	workspaceId: string,
	terminalId: string | null | undefined,
) {
	return useV2NotificationStore(
		selectV2TerminalNotificationStatus(workspaceId, terminalId),
	);
}

export function useV2SourceIdsNotificationStatus(
	workspaceId: string,
	sourceIds: Iterable<string>,
) {
	return useV2NotificationStore(
		selectV2SourceIdsNotificationStatus(workspaceId, sourceIds),
	);
}

function selectStatusForSourceIds(
	state: V2NotificationState,
	workspaceId: string,
	sourceIds: Iterable<string>,
) {
	function* statuses() {
		for (const sourceId of sourceIds) {
			const source = state.sources[sourceId];
			if (source?.workspaceId === workspaceId) {
				yield source.status;
			}
		}
	}
	return getHighestPriorityStatus(statuses());
}

function getTerminalIdForPane(
	pane: V2NotificationPaneLike | null | undefined,
): string | null {
	if (!pane || pane.kind !== "terminal") return null;
	if (!pane.data || typeof pane.data !== "object") return null;
	const terminalId = (pane.data as { terminalId?: unknown }).terminalId;
	return typeof terminalId === "string" && terminalId ? terminalId : null;
}
