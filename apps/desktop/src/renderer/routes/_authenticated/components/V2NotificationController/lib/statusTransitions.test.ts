import { describe, expect, it } from "bun:test";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import { resolveV2AgentStatusTransition } from "./statusTransitions";

const WORKSPACE_ID = "workspace-1";

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
	it("marks start as working on the terminal source", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({
					eventType: "Start",
					terminalId: "terminal-1",
				}),
				statuses: {},
				targetVisible: false,
			}),
		).toEqual({
			clearSources: [],
			setStatus: {
				source: { type: "terminal", id: "terminal-1" },
				status: "working",
			},
		});
	});

	it("clears permission state on stop", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({
					eventType: "Stop",
					terminalId: "terminal-1",
				}),
				statuses: {
					"terminal:terminal-1": {
						workspaceId: WORKSPACE_ID,
						status: "permission",
					},
				},
				targetVisible: false,
			}),
		).toEqual({
			clearSources: [{ type: "terminal", id: "terminal-1" }],
			setStatus: null,
		});
	});

	it("clears stop when the exact target pane is visible", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({ eventType: "Stop", terminalId: "terminal-1" }),
				statuses: {},
				targetVisible: true,
			}),
		).toEqual({
			clearSources: [{ type: "terminal", id: "terminal-1" }],
			setStatus: null,
		});
	});

	it("marks background stop as review", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({ eventType: "Stop", terminalId: "terminal-1" }),
				statuses: {},
				targetVisible: false,
			}),
		).toEqual({
			clearSources: [],
			setStatus: {
				source: { type: "terminal", id: "terminal-1" },
				status: "review",
			},
		});
	});

	it("does not change pane status on session Attached", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({ eventType: "Attached", terminalId: "terminal-1" }),
				statuses: {},
				targetVisible: false,
			}),
		).toEqual({ clearSources: [], setStatus: null });
	});

	it("clears transient pane status on session Detached", () => {
		for (const status of ["working", "permission"] as const) {
			expect(
				resolveV2AgentStatusTransition({
					workspaceId: WORKSPACE_ID,
					payload: payload({ eventType: "Detached", terminalId: "terminal-1" }),
					statuses: {
						"terminal:terminal-1": {
							workspaceId: WORKSPACE_ID,
							status,
						},
					},
					targetVisible: false,
				}),
			).toEqual({
				clearSources: [{ type: "terminal", id: "terminal-1" }],
				setStatus: null,
			});
		}
	});

	it("does not clear review pane status on session Detached", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({ eventType: "Detached", terminalId: "terminal-1" }),
				statuses: {
					"terminal:terminal-1": {
						workspaceId: WORKSPACE_ID,
						status: "review",
					},
				},
				targetVisible: false,
			}),
		).toEqual({ clearSources: [], setStatus: null });
	});

	it("ignores permission state from a different workspace", () => {
		expect(
			resolveV2AgentStatusTransition({
				workspaceId: WORKSPACE_ID,
				payload: payload({ eventType: "Stop", terminalId: "terminal-1" }),
				statuses: {
					"terminal:terminal-1": {
						workspaceId: "workspace-2",
						status: "permission",
					},
				},
				targetVisible: false,
			}),
		).toEqual({
			clearSources: [],
			setStatus: {
				source: { type: "terminal", id: "terminal-1" },
				status: "review",
			},
		});
	});
});
