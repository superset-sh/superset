import { describe, expect, test } from "bun:test";
import { buildSnapshot, formatSnapshot } from "./host-snapshot";

describe("buildSnapshot", () => {
	test("groups each workspace's terminals with their agent state and layout", () => {
		const layout = { activeTabId: null, tabs: [] };
		const [web, api] = buildSnapshot({
			workspaces: [
				{
					id: "ws-web",
					name: "health-check",
					branch: "health-check",
					projectName: "acme-web",
				},
				{ id: "ws-api", name: "main", projectName: "acme-api" },
			],
			terminals: [
				{ terminalId: "t1", workspaceId: "ws-web", title: "Fix login" },
				{ terminalId: "t2", workspaceId: "ws-web", title: null },
				{ terminalId: "t3", workspaceId: "ws-api", title: "zsh" },
			],
			agents: [
				{
					terminalId: "t1",
					agentId: "claude",
					lastEventType: "PermissionRequest",
				},
			],
			layouts: new Map([["ws-web", { layout }]]),
		});
		expect(web?.terminals).toEqual([
			{
				id: "t1",
				title: "Fix login",
				agent: { id: "claude", state: "blocked" },
			},
			{ id: "t2", title: null, agent: null },
		]);
		expect(web?.layout).toBe(layout);
		expect(api).toMatchObject({
			project: "acme-api",
			branch: null,
			layout: null,
		});
		expect(api?.terminals.map((terminal) => terminal.id)).toEqual(["t3"]);
	});

	test("prints each terminal's agent and says when a layout could not be read", () => {
		const text = formatSnapshot(
			buildSnapshot({
				workspaces: [
					{ id: "ws-web", name: "health-check", projectName: "acme-web" },
				],
				terminals: [
					{ terminalId: "t1", workspaceId: "ws-web", title: "Fix login" },
				],
				agents: [
					{ terminalId: "t1", agentId: "claude", lastEventType: "Start" },
				],
				layouts: new Map([["ws-web", { error: "Desktop app timed out" }]]),
			}),
		);
		expect(text).toContain('terminal t1  "Fix login"  claude · working');
		expect(text).toContain("layout unavailable: Desktop app timed out");
	});
});
