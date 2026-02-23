import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMcpToolsetsForChat } from "./load-mcp-toolsets";

function makeTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

describe("loadMcpToolsetsForChat", () => {
	it("emits typed issues for parse, missing command, and invalid config", async () => {
		const cwd = makeTempDir("mcp-load-");

		writeFileSync(
			join(cwd, ".mcp.json"),
			JSON.stringify(
				{
					mcpServers: {
						missingCommand: {
							command: "__definitely_missing_command__",
						},
						invalidRemote: {
							type: "http",
							url: "not-a-url",
						},
					},
				},
				null,
				2,
			),
		);
		writeFileSync(join(cwd, "opencode.json"), "{ invalid json");

		const result = await loadMcpToolsetsForChat({ cwd });

		expect(result.serverNames).toEqual([]);
		expect(result.issues.some((issue) => issue.code === "parse_error")).toBe(
			true,
		);
		expect(
			result.issues.some(
				(issue) =>
					issue.code === "missing_command" &&
					issue.serverName === "missingCommand",
			),
		).toBe(true);
		expect(
			result.issues.some(
				(issue) =>
					issue.code === "invalid_config" &&
					issue.serverName === "invalidRemote",
			),
		).toBe(true);

		// Backward-compatible string summary remains populated.
		expect(result.errors.length).toBeGreaterThan(0);
	});
});
