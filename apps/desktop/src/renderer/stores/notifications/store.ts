import type { Pane, Tab } from "@superset/panes";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type NotificationPaneLike = Pick<Pane<unknown>, "kind" | "data">;
type NotificationTabLike = Pick<Tab<unknown>, "panes">;

export type NotificationSource = { type: "terminal"; id: string };

export type NotificationSourceKey = `${NotificationSource["type"]}:${string}`;
export type NotificationSourceInput =
	| NotificationSource
	| NotificationSourceKey;

/**
 * Profile-local notification state, synchronized between open windows.
 * Terminal agent statuses
 * (working/permission/idle/review) are DERIVED from host agent bindings —
 * see `renderer/hooks/host-service/useNotificationStatus` — so the only
 * facts stored here are about the user, not the agents:
 * manual unread marks and per-terminal seen timestamps.
 */
interface NotificationState {
	/** Workspaces manually marked unread from the sidebar. */
	manualUnread: Record<string, true>;
	/**
	 * terminalId → last agent event the user has seen for that terminal.
	 * Compared to the host binding's lastEventAt to derive `review` (unseen
	 * Stop). `at` must be a HOST-clock value (event occurredAt or binding
	 * lastEventAt) — never the renderer clock, which can drift either way
	 * and, with the monotonic guard, poison the comparison.
	 */
	terminalSeenAt: Record<string, number>;
	setManualUnread: (workspaceId: string) => void;
	clearManualUnread: (workspaceId: string) => void;
	markTerminalSeen: (terminalId: string, at: number) => void;
	pruneTerminalSeen: (terminalId: string) => void;
}

export const useNotificationStore = create<NotificationState>()(
	devtools(
		persist(
			(set) => ({
				manualUnread: {},
				terminalSeenAt: {},
				setManualUnread: (workspaceId) => {
					set((state) => ({
						manualUnread: { ...state.manualUnread, [workspaceId]: true },
					}));
				},
				clearManualUnread: (workspaceId) => {
					set((state) => {
						if (!(workspaceId in state.manualUnread)) return state;
						const { [workspaceId]: _removed, ...manualUnread } =
							state.manualUnread;
						return { manualUnread };
					});
				},
				markTerminalSeen: (terminalId, at) => {
					set((state) => {
						const prev = state.terminalSeenAt[terminalId];
						// Monotonic: a late event must not roll the seen mark back.
						if (prev !== undefined && prev >= at) return state;
						return {
							terminalSeenAt: { ...state.terminalSeenAt, [terminalId]: at },
						};
					});
				},
				pruneTerminalSeen: (terminalId) => {
					set((state) => {
						if (!(terminalId in state.terminalSeenAt)) return state;
						const { [terminalId]: _removed, ...terminalSeenAt } =
							state.terminalSeenAt;
						return { terminalSeenAt };
					});
				},
			}),
			{
				name: "v2-notifications-v1",
				version: 2,
				partialize: (state) => ({
					manualUnread: state.manualUnread,
					terminalSeenAt: state.terminalSeenAt,
				}),
				migrate: migrateNotificationState,
			},
		),
		{ name: "Notifications" },
	),
);

type PersistedV2NotificationState = Pick<
	NotificationState,
	"manualUnread" | "terminalSeenAt"
>;

/**
 * v1 persisted a per-source status map. Terminal statuses are now derived
 * from host bindings (carrying them forward would resurrect the stale-dot
 * bug) and chat statuses never shipped, so only manual unread marks survive.
 */
export function migrateNotificationState(
	persisted: unknown,
	version: number,
): PersistedV2NotificationState {
	if (version >= 2) {
		const state = persisted as
			| Partial<PersistedV2NotificationState>
			| undefined;
		return {
			manualUnread: state?.manualUnread ?? {},
			terminalSeenAt: state?.terminalSeenAt ?? {},
		};
	}
	const legacy = persisted as
		| {
				sources?: Record<string, { workspaceId?: string; status?: string }>;
		  }
		| undefined;
	const manualUnread: Record<string, true> = {};
	for (const [sourceKey, entry] of Object.entries(legacy?.sources ?? {})) {
		if (
			sourceKey.startsWith("manual:") &&
			entry.status === "review" &&
			entry.workspaceId
		) {
			manualUnread[entry.workspaceId] = true;
		}
	}
	return { manualUnread, terminalSeenAt: {} };
}

export function getNotificationSourceKey(
	source: NotificationSourceInput,
): NotificationSourceKey {
	if (typeof source === "string") return source;
	return `${source.type}:${source.id}`;
}

function getTerminalNotificationSource(terminalId: string): NotificationSource {
	return { type: "terminal", id: terminalId };
}

export function getNotificationSourcesForPane(
	pane: NotificationPaneLike | null | undefined,
): NotificationSource[] {
	const terminalId = getTerminalIdForPane(pane);
	if (terminalId) return [getTerminalNotificationSource(terminalId)];
	return [];
}

export function getNotificationSourcesForTab(
	tab: NotificationTabLike | null | undefined,
): NotificationSource[] {
	if (!tab) return [];
	const sources = new Map<NotificationSourceKey, NotificationSource>();
	for (const pane of Object.values(tab.panes)) {
		for (const source of getNotificationSourcesForPane(pane)) {
			sources.set(getNotificationSourceKey(source), source);
		}
	}
	return [...sources.values()];
}

function getTerminalIdForPane(
	pane: NotificationPaneLike | null | undefined,
): string | null {
	if (!pane || pane.kind !== "terminal") return null;
	if (!pane.data || typeof pane.data !== "object") return null;
	const terminalId = (pane.data as { terminalId?: unknown }).terminalId;
	return typeof terminalId === "string" && terminalId ? terminalId : null;
}
