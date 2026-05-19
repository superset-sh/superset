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
			title: "Codex - Complete",
			body: "Improve notifications",
		});
	});

	it("uses needs-attention copy for permission requests", () => {
		expect(
			getV2NativeNotificationContent({
				workspaceName: "Improve notifications",
				payload: payload({
					eventType: "PermissionRequest",
					agent: { agentId: "claude" },
				}),
			}),
		).toMatchObject({
			title: "Claude - Needs Attention",
			body: "Improve notifications",
		});
	});

	it("falls back to generic labels", () => {
		expect(
			getV2NativeNotificationContent({
				workspaceName: " ",
				payload: payload({ agent: { agentId: "droid" } }),
			}),
		).toEqual({
			title: "Droid - Complete",
			body: "Workspace",
		});

		expect(
			getV2NativeNotificationContent({
				workspaceName: "",
				payload: payload({ agent: undefined }),
			}),
		).toMatchObject({
			title: "Agent - Complete",
			body: "Workspace",
		});
	});
});
