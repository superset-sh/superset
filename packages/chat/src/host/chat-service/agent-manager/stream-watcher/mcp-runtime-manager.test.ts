import { describe, expect, it } from "bun:test";
import type { LoadedMcpToolsetsResult } from "@superset/agent";
import { McpRuntimeManager } from "./mcp-runtime-manager";

function makeResult(
	args: {
		serverNames?: string[];
		issues?: LoadedMcpToolsetsResult["issues"];
	} = {},
): LoadedMcpToolsetsResult {
	return {
		serverNames: args.serverNames ?? [],
		sources: [],
		issues: args.issues ?? [],
		errors: [],
		disconnect: async () => {},
	};
}

describe("McpRuntimeManager", () => {
	it("retries failed snapshots after retry interval", async () => {
		let nowMs = 0;
		let loadCount = 0;
		const manager = new McpRuntimeManager({
			sessionId: "s",
			cwd: "/repo",
			apiUrl: "https://api.example.com",
			getHeaders: async () => ({}),
			retryOnIssuesMs: 100,
			now: () => nowMs,
			loadMcpToolsets: async () => {
				loadCount += 1;
				return makeResult({
					issues: [{ code: "connect_error", message: "boom" }],
				});
			},
		});

		await manager.getOrLoad();
		expect(loadCount).toBe(1);

		nowMs = 50;
		await manager.getOrLoad();
		expect(loadCount).toBe(1);

		nowMs = 150;
		await manager.getOrLoad();
		expect(loadCount).toBe(2);
	});

	it("does not retry healthy snapshots until auth signature changes", async () => {
		let nowMs = 0;
		let loadCount = 0;
		let token = "a";
		const manager = new McpRuntimeManager({
			sessionId: "s",
			cwd: "/repo",
			apiUrl: "https://api.example.com",
			getHeaders: async () => ({ Authorization: `Bearer ${token}` }),
			retryOnIssuesMs: 1,
			now: () => nowMs,
			loadMcpToolsets: async () => {
				loadCount += 1;
				return makeResult({ serverNames: ["superset"] });
			},
		});

		await manager.getOrLoad();
		expect(loadCount).toBe(1);

		nowMs = 10_000;
		await manager.getOrLoad();
		expect(loadCount).toBe(1);

		token = "b";
		await manager.getOrLoad();
		expect(loadCount).toBe(2);
	});
});
