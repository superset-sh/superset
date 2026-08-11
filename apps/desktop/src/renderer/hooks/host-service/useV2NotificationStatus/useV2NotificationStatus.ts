import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	getV2NotificationSourceKey,
	getV2NotificationSourcesForPane,
	useV2NotificationStore,
	type V2NotificationPaneLike,
	type V2NotificationSourceInput,
} from "renderer/stores/v2-notifications";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
} from "shared/tabs-types";
import {
	type TerminalAgentBinding,
	useTerminalAgentBindings,
} from "../useTerminalAgentBindings";
import {
	deriveTerminalAgentStatus,
	useTerminalAgentStatuses,
} from "../useTerminalAgentStatuses";

const TERMINAL_PREFIX = "terminal:";

function terminalIdsFromSources(
	sources: Iterable<V2NotificationSourceInput>,
): string[] {
	const ids: string[] = [];
	for (const key of new Set([...sources].map(getV2NotificationSourceKey))) {
		if (key.startsWith(TERMINAL_PREFIX)) {
			ids.push(key.slice(TERMINAL_PREFIX.length));
		}
	}
	return ids;
}

/**
 * Highest-priority status across a set of notification sources. Terminal
 * statuses are derived from host agent bindings (the single source of
 * truth); chat sources have no status yet and contribute nothing.
 */
export function useV2SourcesNotificationStatus(
	workspaceId: string,
	sources: Iterable<V2NotificationSourceInput>,
): ActivePaneStatus | null {
	const statuses = useTerminalAgentStatuses(workspaceId);
	return getHighestPriorityStatus(
		terminalIdsFromSources(sources).map((terminalId) =>
			statuses.get(terminalId),
		),
	);
}

export function useV2PaneNotificationStatus(
	workspaceId: string,
	pane: V2NotificationPaneLike | null | undefined,
): ActivePaneStatus | null {
	return useV2SourcesNotificationStatus(
		workspaceId,
		getV2NotificationSourcesForPane(pane),
	);
}

export function useV2WorkspaceNotificationStatus(
	workspaceId: string,
): ActivePaneStatus | null {
	const statuses = useTerminalAgentStatuses(workspaceId);
	const manualUnread = useV2NotificationStore((state) =>
		Boolean(state.manualUnread[workspaceId]),
	);
	return getHighestPriorityStatus([
		manualUnread ? "review" : undefined,
		...statuses.values(),
	]);
}

export function useV2WorkspaceIsUnread(workspaceId: string): boolean {
	const statuses = useTerminalAgentStatuses(workspaceId);
	const manualUnread = useV2NotificationStore((state) =>
		Boolean(state.manualUnread[workspaceId]),
	);
	if (manualUnread) return true;
	for (const status of statuses.values()) {
		if (status === "review" || status === "failed") return true;
	}
	return false;
}

/**
 * Returns a callback that marks every terminal with a live agent binding in
 * the workspace as seen, clearing derived `review` statuses. Used by the
 * sidebar "mark read" / "clear status" actions.
 */
export function useMarkWorkspaceTerminalsSeen(workspaceId: string): () => void {
	const bindings = useTerminalAgentBindings(workspaceId);
	const markTerminalSeen = useV2NotificationStore(
		(state) => state.markTerminalSeen,
	);
	return useCallback(() => {
		// Host-clock only: "seen through the binding's last event".
		for (const binding of bindings.values()) {
			markTerminalSeen(binding.terminalId, binding.lastEventAt);
		}
	}, [bindings, markTerminalSeen]);
}

/**
 * Number of distinct workspaces needing attention (any derived terminal
 * status other than `working`, or a manual unread mark). Drives the OS dock
 * badge. Aggregates over the bindings queries already mounted by sidebar
 * rows via the react-query cache; workspaces with no observed bindings
 * query contribute only their manual unread mark.
 */
export function useV2AttentionWorkspaceCount(): number {
	const queryClient = useQueryClient();
	const manualUnread = useV2NotificationStore((state) => state.manualUnread);
	const terminalSeenAt = useV2NotificationStore(
		(state) => state.terminalSeenAt,
	);
	const [cacheVersion, setCacheVersion] = useState(0);

	useEffect(() => {
		return queryClient.getQueryCache().subscribe((event) => {
			if (event.query.queryKey[0] === "terminal-agent-bindings") {
				setCacheVersion((version) => version + 1);
			}
		});
	}, [queryClient]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: cacheVersion re-reads the query cache
	return useMemo(() => {
		const workspaceIds = new Set(Object.keys(manualUnread));
		const entries = queryClient.getQueriesData<TerminalAgentBinding[]>({
			queryKey: ["terminal-agent-bindings"],
		});
		for (const [, bindings] of entries) {
			for (const binding of bindings ?? []) {
				const status = deriveTerminalAgentStatus({
					lastEventType: binding.lastEventType,
					lastEventAt: binding.lastEventAt,
					lastSeenAt: terminalSeenAt[binding.terminalId],
				});
				if (
					status === "permission" ||
					status === "review" ||
					status === "failed"
				) {
					workspaceIds.add(binding.workspaceId);
				}
			}
		}
		return workspaceIds.size;
	}, [cacheVersion, manualUnread, terminalSeenAt, queryClient]);
}
