import { describe, expect, test } from "bun:test";
import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { buildPendingSetup } from "./useEnqueueAgentLaunch";

function exampleRequest(
	overrides: Partial<AgentLaunchRequest> = {},
): AgentLaunchRequest {
	return {
		kind: "terminal",
		workspaceId: "pending-workspace",
		agentType: "codex",
		source: "new-workspace",
		terminal: { command: "codex", name: "Codex" },
		...overrides,
	} as AgentLaunchRequest;
}

describe("buildPendingSetup", () => {
	test("returns null when launchRequest is null", () => {
		expect(
			buildPendingSetup({
				workspaceId: "ws-1",
				projectId: "proj-1",
				launchRequest: null,
			}),
		).toBeNull();
	});

	test("rewrites launchRequest.workspaceId to the real id", () => {
		const setup = buildPendingSetup({
			workspaceId: "ws-real-42",
			projectId: "proj-1",
			launchRequest: exampleRequest({ workspaceId: "pending-workspace" }),
		});
		expect(setup?.workspaceId).toBe("ws-real-42");
		expect(setup?.agentLaunchRequest?.workspaceId).toBe("ws-real-42");
	});

	test("passes projectId through", () => {
		const setup = buildPendingSetup({
			workspaceId: "ws-1",
			projectId: "proj-alpha",
			launchRequest: exampleRequest(),
		});
		expect(setup?.projectId).toBe("proj-alpha");
	});

	test("initialCommands is null (V2 host-service handles setup scripts)", () => {
		const setup = buildPendingSetup({
			workspaceId: "ws-1",
			projectId: "proj-1",
			launchRequest: exampleRequest(),
		});
		expect(setup?.initialCommands).toBeNull();
	});

	test("preserves non-workspaceId launchRequest fields (kind, agentType, chat, etc.)", () => {
		const setup = buildPendingSetup({
			workspaceId: "ws-1",
			projectId: "proj-1",
			launchRequest: exampleRequest({
				agentType: "claude",
				source: "mcp",
			}),
		});
		expect(setup?.agentLaunchRequest?.kind).toBe("terminal");
		expect(setup?.agentLaunchRequest?.agentType).toBe("claude");
		expect(setup?.agentLaunchRequest?.source).toBe("mcp");
	});
});
