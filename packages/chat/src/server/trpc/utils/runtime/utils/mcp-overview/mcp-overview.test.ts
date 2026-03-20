import { describe, expect, it } from "bun:test";
import type { RuntimeSession } from "../../runtime";
import { getRuntimeMcpOverview } from "./mcp-overview";

function createRuntime(
	mcpManager: RuntimeSession["mcpManager"],
): RuntimeSession {
	return {
		sessionId: "test-session",
		harness: {} as RuntimeSession["harness"],
		mcpManager,
		hookManager: {} as RuntimeSession["hookManager"],
		mcpManualStatuses: new Map(),
		cwd: "/tmp/workspace",
	};
}

describe("getRuntimeMcpOverview", () => {
	it("returns empty overview when no MCP manager exists", async () => {
		const result = await getRuntimeMcpOverview(createRuntime(undefined));
		expect(result).toEqual({ sourcePath: null, servers: [] });
	});

	it("derives states and targets from config without probing connections", async () => {
		let initCalled = false;
		let statusCalled = false;

		const manager = {
			hasServers: () => true,
			getConfig: () => ({
				mcpServers: {
					remoteHttp: {
						type: "http",
						url: "https://example.com/mcp",
					},
					remoteViaCommand: {
						command: "mcp-remote",
						args: ["https://remote.example.com/mcp"],
					},
					localCommand: {
						command: "bun",
						args: ["run", "server.ts"],
					},
					disabledRemote: {
						type: "remote",
						url: "https://disabled.example.com/mcp",
						enabled: false,
					},
					invalidServer: {
						enabled: true,
					},
				},
			}),
			getConfigPaths: () => ({ project: "/tmp/workspace/.mcp.json" }),
			init: () => {
				initCalled = true;
				return Promise.resolve();
			},
			getServerStatuses: () => {
				statusCalled = true;
				return [];
			},
		} as unknown as RuntimeSession["mcpManager"];

		const result = await getRuntimeMcpOverview(createRuntime(manager));

		expect(initCalled).toBe(false);
		expect(statusCalled).toBe(true);
		expect(result).toEqual({
			sourcePath: "/tmp/workspace/.mcp.json",
			servers: [
				{
					name: "disabledRemote",
					state: "disabled",
					transport: "remote",
					target: "https://disabled.example.com/mcp",
				},
				{
					name: "invalidServer",
					state: "invalid",
					transport: "unknown",
					target: "Not configured",
				},
				{
					name: "localCommand",
					state: "enabled",
					transport: "local",
					target: "bun run server.ts",
				},
				{
					name: "remoteHttp",
					state: "enabled",
					transport: "remote",
					target: "https://example.com/mcp",
				},
				{
					name: "remoteViaCommand",
					state: "enabled",
					transport: "remote",
					target: "https://remote.example.com/mcp",
				},
			],
		});
	});
});
