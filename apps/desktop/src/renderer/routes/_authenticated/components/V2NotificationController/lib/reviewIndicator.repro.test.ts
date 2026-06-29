/**
 * Reproduction for #5061 — "Green notification circle is not showing up when
 * claude finishes running."
 *
 * The green dot in the workspaces panel is the aggregated workspace status
 * resolving to "review". This test drives a realistic agent lifecycle through
 * the pure transition logic, applies the result to a status map exactly the
 * way `updatePaneStatus` does, then aggregates with `getHighestPriorityStatus`
 * — the same selector the sidebar uses (`selectV2WorkspaceNotificationStatus`).
 */
import { describe, expect, it } from "bun:test";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import {
	getV2NotificationSourceKey,
	type V2NotificationSourceInput,
} from "renderer/stores/v2-notifications";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
} from "shared/tabs-types";
import { resolveV2AgentStatusTransition } from "./statusTransitions";

const WORKSPACE_ID = "workspace-1";

interface StatusEntry {
	workspaceId: string;
	status: ActivePaneStatus;
}

/**
 * Minimal stand-in for the v2 notification store's `sources` map plus the
 * apply/clear logic in `updatePaneStatus`/`clearSources`.
 */
function createStatusMap() {
	const sources: Record<string, StatusEntry | undefined> = {};
	return {
		sources,
		apply(
			workspaceId: string,
			payload: AgentLifecyclePayload,
			targetVisible: boolean,
		) {
			const transition = resolveV2AgentStatusTransition({
				workspaceId,
				payload,
				statuses: sources,
				targetVisible,
			});
			for (const input of transition.clearSources) {
				delete sources[
					getV2NotificationSourceKey(input as V2NotificationSourceInput)
				];
			}
			if (transition.setStatus) {
				const key = getV2NotificationSourceKey(transition.setStatus.source);
				sources[key] = {
					workspaceId,
					status: transition.setStatus.status,
				};
			}
		},
		workspaceStatus(workspaceId: string): ActivePaneStatus | null {
			function* statuses() {
				for (const entry of Object.values(sources)) {
					if (entry?.workspaceId === workspaceId) yield entry.status;
				}
			}
			return getHighestPriorityStatus(statuses());
		},
	};
}

function event(
	eventType: AgentLifecyclePayload["eventType"],
	terminalId = "terminal-1",
): AgentLifecyclePayload {
	return { eventType, terminalId, occurredAt: 1 };
}

describe("#5061 green review indicator after claude finishes", () => {
	it("shows review for a single background agent turn (sanity)", () => {
		const map = createStatusMap();
		// Background workspace => targetVisible is always false.
		map.apply(WORKSPACE_ID, event("Start"), false);
		map.apply(WORKSPACE_ID, event("Stop"), false);
		expect(map.workspaceStatus(WORKSPACE_ID)).toBe("review");
	});

	it("shows review when a turn's last tool was a permission prompt", () => {
		const map = createStatusMap();
		// Claude turn that ends on a tool: UserPromptSubmit(Start) ->
		// PreToolUse(PermissionRequest) -> PostToolUse(Start) -> Stop.
		map.apply(WORKSPACE_ID, event("Start"), false);
		map.apply(WORKSPACE_ID, event("PermissionRequest"), false);
		map.apply(WORKSPACE_ID, event("Start"), false);
		map.apply(WORKSPACE_ID, event("Stop"), false);
		expect(map.workspaceStatus(WORKSPACE_ID)).toBe("review");
	});

	it("still shows review for a finished agent while another pane works", () => {
		// A workspace can run more than one agent (multiple terminal panes).
		// terminal-1 finishes (review). terminal-2 is still working.
		// The "done" agent should still surface its green dot at the workspace
		// level so the user knows there is something to revisit.
		const map = createStatusMap();
		map.apply(WORKSPACE_ID, event("Start", "terminal-1"), false);
		map.apply(WORKSPACE_ID, event("Start", "terminal-2"), false);
		map.apply(WORKSPACE_ID, event("Stop", "terminal-1"), false);

		// terminal-1 is review, terminal-2 is working.
		expect(
			map.sources[
				getV2NotificationSourceKey({ type: "terminal", id: "terminal-1" })
			]?.status,
		).toBe("review");
		expect(
			map.sources[
				getV2NotificationSourceKey({ type: "terminal", id: "terminal-2" })
			]?.status,
		).toBe("working");

		// BUG: aggregation reports "working" because working outranks review,
		// so the green circle never appears for the finished agent.
		expect(map.workspaceStatus(WORKSPACE_ID)).toBe("review");
	});
});
