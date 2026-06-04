import {
	getV2NotificationSourceKey,
	getV2TerminalNotificationSource,
	type V2NotificationSource,
	type V2NotificationStatusEntry,
} from "renderer/stores/v2-notifications";
import type { ActivePaneStatus } from "shared/tabs-types";

/**
 * Snapshot of a live agent binding as returned by the host's
 * `terminalAgents.listByWorkspace` query — only the fields the sidebar
 * activity indicator needs.
 */
export interface AgentBindingSnapshot {
	terminalId: string;
	lastEventType: string;
	lastEventAt: number;
}

export interface V2HydrationUpdate {
	source: V2NotificationSource;
	status: ActivePaneStatus;
	occurredAt: number;
}

/**
 * Maps a normalized lifecycle event type to the sidebar status it implies
 * for a *snapshot* of a still-alive agent binding.
 *
 * Only the currently-ongoing states are hydrated: `Start` (mid-task) and
 * `PermissionRequest` (blocked) describe what the live agent process is doing
 * right now, so the binding is an accurate source of truth. `Stop` (review)
 * is a past completion the user may already have acknowledged, so we leave it
 * to live events rather than re-surfacing a dismissed "ready for review" badge
 * every time a host subscription reconnects. `Attached` is bound-but-idle and
 * carries no attention status.
 */
export function deriveV2StatusFromLifecycleEventType(
	eventType: string,
): ActivePaneStatus | null {
	switch (eventType) {
		case "Start":
			return "working";
		case "PermissionRequest":
			return "permission";
		default:
			return null;
	}
}

/**
 * Builds the status updates needed to hydrate the v2 notification store from a
 * host's current agent bindings.
 *
 * Needed when a host event-bus subscription comes online *after* an agent has
 * already started working — the common case for a remote host, whose relay
 * subscription is established well after the agent began (often from another
 * device). The desktop never sees the originating `Start` event, so without
 * this snapshot the sidebar indicator stays static while the agent runs.
 *
 * Existing live entries win: a binding is skipped when the store already tracks
 * that terminal source, so hydration never clobbers fresher live state.
 */
export function deriveV2HydrationUpdates({
	bindings,
	existingSources,
}: {
	bindings: AgentBindingSnapshot[];
	existingSources: Record<string, V2NotificationStatusEntry | undefined>;
}): V2HydrationUpdate[] {
	const updates: V2HydrationUpdate[] = [];
	for (const binding of bindings) {
		const status = deriveV2StatusFromLifecycleEventType(binding.lastEventType);
		if (!status) continue;
		const source = getV2TerminalNotificationSource(binding.terminalId);
		const key = getV2NotificationSourceKey(source);
		if (existingSources[key]) continue;
		updates.push({ source, status, occurredAt: binding.lastEventAt });
	}
	return updates;
}
