import type { LinearTriggerEvent, TriggerScope } from "../automation-triggers";
import {
	type BaseMatchableEvent,
	type MatchResult,
	no,
	scopeAllows,
	scopeAllowsAny,
} from "./core";

/** A Linear delivery, normalized to what Linear triggers filter on. */
export type LinearMatchableEvent = BaseMatchableEvent & {
	provider: "linear";
	teamId: string | null;
	projectId: string | null;
	/** The workflow state the issue is in after the change. */
	stateId: string | null;
	/** The issue's assignee after the change; what the assignee filter compares against. */
	assigneeId: string | null;
	/** Ids, not names: a label can be renamed and triggers must keep matching. */
	labelIds: string[];
	/** The product-level names this delivery maps to; see linearEventNames. */
	names: LinearTriggerEvent[];
};

/**
 * Maps a Linear delivery to the events a trigger names. Linear's wire events
 * are entity × action; what actually changed is only visible in `updatedFrom`,
 * which carries the previous value of every property the update touched.
 */
export function linearEventNames(delivery: {
	/** The entity, e.g. `Issue` or `Cycle`. */
	type: string;
	/** `create`, `update` or `remove`. */
	action: string;
	updatedFrom: Record<string, unknown> | null;
	assigneeId: string | null;
	completedAt: string | null;
}): LinearTriggerEvent[] {
	const { type, action, updatedFrom } = delivery;
	if (type === "Issue") {
		if (action === "create") {
			// An issue created with an assignee is an assignment too, the same
			// way Linear itself notifies the assignee.
			return delivery.assigneeId
				? ["issue.created", "issue.assigned"]
				: ["issue.created"];
		}
		if (action === "update" && updatedFrom) {
			const names: LinearTriggerEvent[] = [];
			if ("stateId" in updatedFrom) names.push("issue.status_changed");
			// Reassigning counts; unassigning does not.
			if ("assigneeId" in updatedFrom && delivery.assigneeId) {
				names.push("issue.assigned");
			}
			return names;
		}
		return [];
	}
	if (
		type === "Cycle" &&
		action === "update" &&
		updatedFrom &&
		"completedAt" in updatedFrom &&
		delivery.completedAt
	) {
		return ["cycle.ended"];
	}
	return [];
}

/** Whether a Linear trigger config accepts this event. */
export function linearTriggerMatches(
	config: {
		event: string;
		teams: TriggerScope;
		projects: TriggerScope;
		labels: TriggerScope;
		toStatus: TriggerScope;
		assignee: TriggerScope;
	},
	event: LinearMatchableEvent,
): MatchResult {
	if (!event.names.includes(config.event as LinearTriggerEvent)) {
		return no("event");
	}
	if (!scopeAllows(config.teams, event.teamId)) {
		return no("team");
	}
	if (!scopeAllows(config.projects, event.projectId)) {
		return no("project");
	}
	if (!scopeAllowsAny(config.labels, event.labelIds)) {
		return no("label");
	}
	if (!scopeAllows(config.toStatus, event.stateId)) {
		return no("status");
	}
	if (!scopeAllows(config.assignee, event.assigneeId)) {
		return no("assignee");
	}
	return { matches: true };
}
