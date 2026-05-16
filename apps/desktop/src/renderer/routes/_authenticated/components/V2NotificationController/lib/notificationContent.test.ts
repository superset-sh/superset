import { describe, expect, it } from "bun:test";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import { getV2NativeNotificationContent } from "./notificationContent";

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

describe("getV2NativeNotificationContent", () => {
	it("uses the agent label in the title and workspace label in the body", () => {
		expect(
			getV2NativeNotificationContent({
				workspaceName: "Improve notifications",
				payload: payload({
					agent: { agentId: "codex", sessionId: "session-1" },
				}),
			}),
		).toEqual({
			title: "Agent Complete - Codex",
			body: "Workspace: Improve notifications",
		});
	});

	it("uses needs-input copy for permission requests", () => {
		expect(
			getV2NativeNotificationContent({
				workspaceName: "Improve notifications",
				payload: payload({
					eventType: "PermissionRequest",
					agent: { agentId: "claude" },
				}),
			}),
		).toMatchObject({
			title: "Agent Needs Input - Claude",
			body: "Workspace: Improve notifications",
		});
	});

	it("falls back to generic labels", () => {
		expect(
			getV2NativeNotificationContent({
				workspaceName: " ",
				payload: payload({ agent: { agentId: "droid" } }),
			}),
		).toEqual({
			title: "Agent Complete - Droid",
			body: "Workspace: Workspace",
		});

		expect(
			getV2NativeNotificationContent({
				workspaceName: "",
				payload: payload({ agent: undefined }),
			}),
		).toMatchObject({
			title: "Agent Complete",
			body: "Workspace: Workspace",
		});
	});
});
