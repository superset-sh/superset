import { describe, expect, it } from "bun:test";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
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
	it("uses project and workspace, agent status, and assistant preview", () => {
		expect(
			getV2NativeNotificationContent({
				workspaceName: "Improve notifications",
				projectName: "superset",
				payload: payload({
					agent: { agentId: "codex", sessionId: "session-1" },
					preview: "**Added previews.**\nAll 12 tests pass.",
				}),
			}),
		).toEqual({
			title: "superset › Improve notifications",
			subtitle: "Codex · Finished",
			body: "Added previews. All 12 tests pass.",
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
			title: "Improve notifications",
			subtitle: "Claude · Needs attention",
			body: "Open workspace",
		});
	});

	it("labels Failed as Failed, not Complete", () => {
		const result = getV2NativeNotificationContent({
			workspaceName: "Improve notifications",
			payload: payload({
				eventType: "Failed",
				agent: { agentId: "claude" },
			}),
		});
		expect(result).toMatchObject({
			title: "Improve notifications",
			subtitle: "Claude · Failed",
			body: "Open workspace",
		});
		expect(result.subtitle).not.toContain("Complete");
	});

	it("falls back to generic labels", () => {
		expect(
			getV2NativeNotificationContent({
				workspaceName: " ",
				payload: payload({ agent: { agentId: "droid" } }),
			}),
		).toEqual({
			title: "Workspace",
			subtitle: "Droid · Finished",
			body: "Open workspace",
		});

		expect(
			getV2NativeNotificationContent({
				workspaceName: "",
				payload: payload({ agent: undefined }),
			}),
		).toMatchObject({
			title: "Workspace",
			subtitle: "Agent · Finished",
			body: "Open workspace",
		});
	});
});

it("cleans and bounds previews without exposing markdown links or ANSI styling", () => {
	const result = getV2NativeNotificationContent({
		workspaceName: "test",
		payload: payload({
			preview:
				"\u001b[32m# Done\u001b[0m\n- See [result](https://example.com)\n" +
				"a".repeat(200),
		}),
	});
	expect(result.body.startsWith("Done See result ")).toBe(true);
	expect(result.body.length).toBe(180);
	expect(result.body.endsWith("…")).toBe(true);
});
it("truncates emoji previews without splitting Unicode code points", () => {
	const result = getV2NativeNotificationContent({
		workspaceName: "test",
		payload: payload({ preview: "😀".repeat(200) }),
	});
	expect(result.body).toBe(`${"😀".repeat(179)}…`);
});

it("uses the permission text as the preview", () => {
	expect(
		getV2NativeNotificationContent({
			workspaceName: "test",
			payload: payload({
				eventType: "PermissionRequest",
				preview: "Run `bun install`?",
			}),
		}).body,
	).toBe("Run bun install?");
});

describe("agent and finish-type matrix", () => {
	for (const agentId of Object.keys(AGENT_IDENTITY_LABELS) as Array<
		keyof typeof AGENT_IDENTITY_LABELS
	>) {
		const label = AGENT_IDENTITY_LABELS[agentId];
		for (const [eventType, status] of [
			["Stop", "Finished"],
			["PermissionRequest", "Needs attention"],
			["Failed", "Failed"],
		] as const) {
			it(`${agentId} ${eventType} preserves context, status, and preview`, () => {
				expect(
					getV2NativeNotificationContent({
						projectName: "Superset",
						workspaceName: "test",
						payload: payload({
							agent: { agentId },
							eventType,
							preview: "Actual agent text.",
						}),
					}),
				).toEqual({
					title: "Superset › test",
					subtitle: `${label} · ${status}`,
					body: "Actual agent text.",
				});
			});
		}
	}
});
