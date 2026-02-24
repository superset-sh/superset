import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMcpOverview } from "./mcp-overview";

const tempDirectories: string[] = [];

function createTempDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "chat-mcp-overview-"));
	tempDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("getMcpOverview", () => {
	it("returns empty list when .mcp.json is missing", () => {
		const cwd = createTempDirectory();
		expect(getMcpOverview(cwd)).toEqual({
			sourcePath: null,
			servers: [],
		});
	});

	it("reads servers and derives mock states from settings", () => {
		const cwd = createTempDirectory();
		writeFileSync(
			join(cwd, ".mcp.json"),
			JSON.stringify({
				mcpServers: {
					remoteEnabled: {
						type: "http",
						url: "https://example.com/mcp",
					},
					localDisabled: {
						command: "bun",
						args: ["run", "mcp.ts"],
						disabled: true,
					},
					invalidServer: {
						enabled: true,
					},
				},
			}),
			"utf-8",
		);

		const result = getMcpOverview(cwd);
		expect(result.sourcePath).toBe(join(cwd, ".mcp.json"));
		expect(result.servers).toEqual([
			{
				name: "invalidServer",
				state: "invalid",
				transport: "unknown",
				target: "Not configured",
			},
			{
				name: "localDisabled",
				state: "disabled",
				transport: "local",
				target: "bun run mcp.ts",
			},
			{
				name: "remoteEnabled",
				state: "enabled",
				transport: "remote",
				target: "https://example.com/mcp",
			},
		]);
	});
});
