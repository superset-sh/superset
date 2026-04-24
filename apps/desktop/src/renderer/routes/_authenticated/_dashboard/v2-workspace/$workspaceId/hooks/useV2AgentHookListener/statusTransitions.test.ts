import { describe, expect, it } from "bun:test";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import type { V2NotificationTarget } from "./resolveV2NotificationTarget";
import { resolveV2AgentStatusTransition } from "./statusTransitions";

const WORKSPACE_ID = "workspace-1";

const target: V2NotificationTarget = {
	workspaceId: WORKSPACE_ID,
	tabId: "tab-1",
	paneId: "pane-1",
	terminalId: "terminal-1",
};

function payload(
	overrides: Partial<AgentLifecyclePayload>,
): AgentLifecyclePayload {
	return {
		eventType: "Stop",
		terminalId: "terminal-1",
		occurredAt: 1,
		...overrides,
	};
}

describe("resolveV2AgentStatusTransition", () => {
	it("marks start as working on the terminal id and clears pane aliases", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({
					eventType: "Start",
					terminalId: "terminal-1",
				}),
				target,
				statuses: {},
				targetVisible: false,
			}),
		).toEqual({
			clearIds: ["pane-1"],
			setStatus: { id: "terminal-1", status: "working" },
		});
	});

	it("clears permission state on stop even when permission was keyed by the pane id", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({
					eventType: "Stop",
					terminalId: "terminal-1",
				}),
				target,
				statuses: {
					"pane-1": { workspaceId: WORKSPACE_ID, status: "permission" },
				},
				targetVisible: false,
			}),
		).toEqual({
			clearIds: ["terminal-1", "pane-1"],
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
