import { describe, expect, it } from "bun:test";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import { buildV2NotificationContent } from "./lifecycleEvents";

function stopPayload(
	overrides: Partial<AgentLifecyclePayload> = {},
): AgentLifecyclePayload {
	return {
		eventType: "Stop",
		terminalId: "terminal-1",
		occurredAt: 1,
		...overrides,
	};
}

describe("buildV2NotificationContent", () => {
	it("includes the workspace name in the title so users juggling many open workspaces can tell which agent finished", () => {
		const { title } = buildV2NotificationContent(stopPayload(), "frontend-fix");
		expect(title).toBe("Agent Complete — frontend-fix");
	});

	it("includes the workspace name on permission request notifications", () => {
		const { title } = buildV2NotificationContent(
			stopPayload({ eventType: "PermissionRequest" }),
			"backend-service",
		);
		expect(title).toBe("Awaiting Response — backend-service");
	});

	it("falls back to the generic title when no workspace name is available", () => {
		const completed = buildV2NotificationContent(stopPayload(), null);
		expect(completed.title).toBe("Agent Complete");

		const permission = buildV2NotificationContent(
			stopPayload({ eventType: "PermissionRequest" }),
			undefined,
		);
		expect(permission.title).toBe("Awaiting Response");
	});

	it("uses distinct bodies for stop vs permission events", () => {
		expect(buildV2NotificationContent(stopPayload(), "ws").body).toBe(
			"Your agent has finished",
		);
		expect(
			buildV2NotificationContent(
				stopPayload({ eventType: "PermissionRequest" }),
				"ws",
			).body,
		).toBe("Your agent needs input");
	});
});
