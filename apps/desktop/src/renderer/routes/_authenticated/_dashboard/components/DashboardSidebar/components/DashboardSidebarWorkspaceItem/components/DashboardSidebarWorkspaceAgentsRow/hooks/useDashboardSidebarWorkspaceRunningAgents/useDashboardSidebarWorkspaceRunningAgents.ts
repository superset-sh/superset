import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	useV2NotificationStore,
	type V2NotificationSource,
} from "renderer/stores/v2-notifications";
import { useShallow } from "zustand/react/shallow";

/** Statuses that count as a "running" agent (excludes finished `review`). */
export type RunningAgentStatus = "working" | "permission";

export interface DashboardSidebarRunningAgent {
	/** Stable key for React lists, derived from the notification source. */
	sourceKey: string;
	source: V2NotificationSource;
	/** `working` (actively processing) or `permission` (blocked, needs input). */
	status: RunningAgentStatus;
	/** When the agent entered its current status (ms since epoch). */
	occurredAt: number;
	/** Best-effort human label — chat session title, else a generic fallback. */
	label: string;
}

/**
 * Live list of "running" agents for a workspace: notification sources currently
 * `working` or awaiting `permission`, newest first. Chat agents resolve to their
 * session title; terminal agents fall back to a generic label.
 *
 * Mirrors {@link useDashboardSidebarWorkspacePorts} so a workspace detail row
 * can render agents the same way it renders ports.
 */
export function useDashboardSidebarWorkspaceRunningAgents(
	workspaceId: string,
): DashboardSidebarRunningAgent[] {
	const entries = useV2NotificationStore(
		useShallow((state) => {
			const running = [];
			for (const entry of Object.values(state.sources)) {
				if (
					entry.workspaceId === workspaceId &&
					(entry.status === "working" || entry.status === "permission")
				) {
					running.push(entry);
				}
			}
			running.sort((a, b) => b.occurredAt - a.occurredAt);
			return running;
		}),
	);

	const collections = useCollections();
	const { data: sessions } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) =>
					eq(chatSessions.v2WorkspaceId, workspaceId),
				)
				.select(({ chatSessions }) => ({
					id: chatSessions.id,
					title: chatSessions.title,
				})),
		[collections.chatSessions, workspaceId],
	);

	return useMemo(() => {
		const titleById = new Map<string, string | null>();
		for (const session of sessions ?? []) {
			titleById.set(session.id, session.title);
		}
		return entries.map((entry) => ({
			sourceKey: entry.sourceKey,
			source: entry.source,
			status: entry.status as RunningAgentStatus,
			occurredAt: entry.occurredAt,
			label:
				entry.source.type === "chat"
					? titleById.get(entry.source.id)?.trim() || "Chat agent"
					: "Agent",
		}));
	}, [entries, sessions]);
}
