import type { Pane, Tab } from "@superset/panes";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
} from "shared/tabs-types";
import { create } from "zustand";

export type V2NotificationPaneLike = Pick<Pane<unknown>, "kind" | "data">;
export type V2NotificationTabLike = Pick<Tab<unknown>, "panes">;

export type V2NotificationSource =
	| { type: "terminal"; id: string }
	| { type: "chat"; id: string };

export type V2NotificationSourceType = V2NotificationSource["type"];
export type V2NotificationSourceKey = `${V2NotificationSourceType}:${string}`;
export type V2NotificationSourceInput =
	| V2NotificationSource
	| V2NotificationSourceKey;

export interface V2NotificationStatusEntry {
	sourceKey: V2NotificationSourceKey;
	source: V2NotificationSource;
	workspaceId: string;
	status: ActivePaneStatus;
	occurredAt: number;
}

export interface V2NotificationState {
	sources: Record<string, V2NotificationStatusEntry>;
	setSourceStatus: (
		source: V2NotificationSource,
		workspaceId: string,
		status: ActivePaneStatus,
		occurredAt?: number,
	) => void;
	setTerminalStatus: (
		terminalId: string,
		workspaceId: string,
		status: ActivePaneStatus,
		occurredAt?: number,
	) => void;
	setChatStatus: (
		chatId: string,
		workspaceId: string,
		status: ActivePaneStatus,
		occurredAt?: number,
	) => void;
	clearSourceStatus: (
		source: V2NotificationSourceInput,
		workspaceId?: string,
	) => void;
	clearSourceStatuses: (
		sources: Iterable<V2NotificationSourceInput>,
		workspaceId?: string,
	) => void;
	clearSourceAttention: (
		source: V2NotificationSourceInput,
		workspaceId?: string,
	) => void;
	clearWorkspaceStatuses: (workspaceId: string) => void;
	clearWorkspaceAttention: (workspaceId: string) => void;
}

export const useV2NotificationStore = create<V2NotificationState>()((set) => ({
	sources: {},
	setSourceStatus: (source, workspaceId, status, occurredAt = Date.now()) => {
		const sourceKey = getV2NotificationSourceKey(source);
		set((state) => ({
			sources: {
				...state.sources,
				[sourceKey]: {
					sourceKey,
					source,
					workspaceId,
					status,
					occurredAt,
				},
			},
		}));
	},
	setTerminalStatus: (terminalId, workspaceId, status, occurredAt) => {
		useV2NotificationStore
			.getState()
			.setSourceStatus(
				getV2TerminalNotificationSource(terminalId),
				workspaceId,
				status,
				occurredAt,
			);
	},
	setChatStatus: (chatId, workspaceId, status, occurredAt) => {
		useV2NotificationStore
			.getState()
			.setSourceStatus(
				getV2ChatNotificationSource(chatId),
				workspaceId,
				status,
				occurredAt,
			);
	},
	clearSourceStatus: (source, workspaceId) => {
		const sourceKey = getV2NotificationSourceKey(source);
		set((state) => {
			const entry = state.sources[sourceKey];
			if (!entry || (workspaceId && entry.workspaceId !== workspaceId)) {
				return state;
			}
			const { [sourceKey]: _removed, ...sources } = state.sources;
			return { sources };
		});
	},
	clearSourceStatuses: (sourceInputs, workspaceId) => {
		set((state) => {
			const sourceKeys = new Set(
				[...sourceInputs].map(getV2NotificationSourceKey),
			);
			const sources: Record<string, V2NotificationStatusEntry> = {};
			let changed = false;
			for (const [sourceKey, source] of Object.entries(state.sources)) {
				if (
					sourceKeys.has(sourceKey as V2NotificationSourceKey) &&
					(!workspaceId || source.workspaceId === workspaceId)
				) {
					changed = true;
					continue;
				}
				sources[sourceKey] = source;
			}
			return changed ? { sources } : state;
		});
	},
	clearSourceAttention: (source, workspaceId) => {
		const sourceKey = getV2NotificationSourceKey(source);
		set((state) => {
			const entry = state.sources[sourceKey];
			if (
				!entry ||
				entry.status !== "review" ||
				(workspaceId && entry.workspaceId !== workspaceId)
			) {
				return state;
			}
			const { [sourceKey]: _removed, ...sources } = state.sources;
			return { sources };
		});
	},
	clearWorkspaceStatuses: (workspaceId) => {
		set((state) => {
			const sources: Record<string, V2NotificationStatusEntry> = {};
			let changed = false;
			for (const [sourceKey, source] of Object.entries(state.sources)) {
				if (source.workspaceId === workspaceId) {
					changed = true;
					continue;
				}
				sources[sourceKey] = source;
			}
			return changed ? { sources } : state;
		});
	},
	clearWorkspaceAttention: (workspaceId) => {
		set((state) => {
			const sources: Record<string, V2NotificationStatusEntry> = {};
			let changed = false;
			for (const [sourceKey, source] of Object.entries(state.sources)) {
				if (source.workspaceId === workspaceId && source.status === "review") {
					changed = true;
					continue;
				}
				sources[sourceKey] = source;
			}
			return changed ? { sources } : state;
		});
	},
}));

export function getV2NotificationSourceKey(
	source: V2NotificationSourceInput,
): V2NotificationSourceKey {
	if (typeof source === "string") return source;
	return `${source.type}:${source.id}`;
}

export function getV2TerminalNotificationSource(
	terminalId: string,
): V2NotificationSource {
	return { type: "terminal", id: terminalId };
}

export function getV2ChatNotificationSource(
	chatId: string,
): V2NotificationSource {
	return { type: "chat", id: chatId };
}

export function getV2NotificationSourcesForPane(
	pane: V2NotificationPaneLike | null | undefined,
): V2NotificationSource[] {
	const terminalId = getTerminalIdForPane(pane);
	if (terminalId) return [getV2TerminalNotificationSource(terminalId)];
	const chatId = getChatIdForPane(pane);
	if (chatId) return [getV2ChatNotificationSource(chatId)];
	return [];
}

export function getV2NotificationSourcesForTab(
	tab: V2NotificationTabLike | null | undefined,
): V2NotificationSource[] {
	if (!tab) return [];
	const sources = new Map<V2NotificationSourceKey, V2NotificationSource>();
	for (const pane of Object.values(tab.panes)) {
		for (const source of getV2NotificationSourcesForPane(pane)) {
			sources.set(getV2NotificationSourceKey(source), source);
		}
	}
	return [...sources.values()];
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
	return selectV2SourcesNotificationStatus(
		workspaceId,
		getV2NotificationSourcesForTab(tab),
	);
}

export function selectV2PaneNotificationStatus(
	workspaceId: string,
	pane: V2NotificationPaneLike | null | undefined,
) {
	return selectV2SourcesNotificationStatus(
		workspaceId,
		getV2NotificationSourcesForPane(pane),
	);
}

export function selectV2TerminalNotificationStatus(
	workspaceId: string,
	terminalId: string | null | undefined,
) {
	return selectV2SourcesNotificationStatus(
		workspaceId,
		terminalId ? [getV2TerminalNotificationSource(terminalId)] : [],
	);
}

export function selectV2ChatNotificationStatus(
	workspaceId: string,
	chatId: string | null | undefined,
) {
	return selectV2SourcesNotificationStatus(
		workspaceId,
		chatId ? [getV2ChatNotificationSource(chatId)] : [],
	);
}

export function selectV2SourcesNotificationStatus(
	workspaceId: string,
	sources: Iterable<V2NotificationSourceInput>,
) {
	const sourceKeys = [...new Set([...sources].map(getV2NotificationSourceKey))];
	return (state: V2NotificationState) =>
		selectStatusForSourceKeys(state, workspaceId, sourceKeys);
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

export function useV2ChatNotificationStatus(
	workspaceId: string,
	chatId: string | null | undefined,
) {
	return useV2NotificationStore(
		selectV2ChatNotificationStatus(workspaceId, chatId),
	);
}

export function useV2SourcesNotificationStatus(
	workspaceId: string,
	sources: Iterable<V2NotificationSourceInput>,
) {
	return useV2NotificationStore(
		selectV2SourcesNotificationStatus(workspaceId, sources),
	);
}

function selectStatusForSourceKeys(
	state: V2NotificationState,
	workspaceId: string,
	sourceKeys: Iterable<V2NotificationSourceKey>,
) {
	function* statuses() {
		for (const sourceKey of sourceKeys) {
			const source = state.sources[sourceKey];
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

function getChatIdForPane(
	pane: V2NotificationPaneLike | null | undefined,
): string | null {
	if (!pane || pane.kind !== "chat") return null;
	if (!pane.data || typeof pane.data !== "object") return null;
	const sessionId = (pane.data as { sessionId?: unknown }).sessionId;
	return typeof sessionId === "string" && sessionId ? sessionId : null;
}
