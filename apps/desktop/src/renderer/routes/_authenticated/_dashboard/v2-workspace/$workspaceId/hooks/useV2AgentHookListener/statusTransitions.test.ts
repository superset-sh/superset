import { describe, expect, it } from "bun:test";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import type { V2NotificationTarget } from "./resolveV2NotificationTarget";
import { resolveV2AgentStatusTransition } from "./statusTransitions";

const WORKSPACE_ID = "workspace-1";

const target: V2NotificationTarget = {
	workspaceId: WORKSPACE_ID,
	tabId: "tab-1",
	paneId: "pane-1",
	sourceId: "terminal-1",
	terminalId: "terminal-1",
};

function payload(
	overrides: Partial<AgentLifecyclePayload>,
): AgentLifecyclePayload {
	return {
		eventType: "Stop",
		occurredAt: 1,
		...overrides,
	};
}

describe("resolveV2AgentStatusTransition", () => {
	it("marks start as working on the stable source id and clears alternates", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({
					eventType: "Start",
					paneId: "legacy-pane",
					terminalId: "terminal-1",
				}),
				target,
				statuses: {},
				targetVisible: false,
			}),
		).toEqual({
			clearIds: ["legacy-pane", "pane-1"],
			setStatus: { id: "terminal-1", status: "working" },
		});
	});

	it("clears permission state on stop even when permission was keyed by an alternate id", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({
					eventType: "Stop",
					paneId: "legacy-pane",
					terminalId: "terminal-1",
				}),
				target,
				statuses: {
					"legacy-pane": { workspaceId: WORKSPACE_ID, status: "permission" },
				},
				targetVisible: false,
			}),
		).toEqual({
			clearIds: ["terminal-1", "legacy-pane", "pane-1"],
			setStatus: null,
		});
	});

	it("clears stop when the exact target pane is visible", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({ eventType: "Stop", terminalId: "terminal-1" }),
				target,
				statuses: {},
				targetVisible: true,
			}),
		).toEqual({
			clearIds: ["terminal-1", "pane-1"],
			setStatus: null,
		});
	});

	it("marks background stop as review", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({ eventType: "Stop", terminalId: "terminal-1" }),
				target,
				statuses: {},
				targetVisible: false,
			}),
		).toEqual({
			clearIds: ["pane-1"],
			setStatus: { id: "terminal-1", status: "review" },
		});
	});

	it("ignores permission state from a different workspace", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({ eventType: "Stop", terminalId: "terminal-1" }),
				target,
				statuses: {
					"terminal-1": { workspaceId: "workspace-2", status: "permission" },
				},
				targetVisible: false,
			}),
		).toEqual({
			clearIds: ["pane-1"],
			setStatus: { id: "terminal-1", status: "review" },
		});
	});
});
