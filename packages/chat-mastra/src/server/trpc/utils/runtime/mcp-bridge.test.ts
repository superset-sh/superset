import { afterEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ensureMastraCodeMcpBridge,
	getMastraCodeMcpBridgeDebugInfo,
} from "./mcp-bridge";

const cleanupPaths: string[] = [];
const SUPERSET_AUTH_HEADER =
	"Authorization: Bearer " + "$" + "{SUPERSET_MCP_AUTH_TOKEN}";

afterEach(() => {
	while (cleanupPaths.length > 0) {
		const nextPath = cleanupPaths.pop();
		if (!nextPath) continue;
		rmSync(nextPath, { force: true, recursive: true });
	}
});

function createTempWorkspace(): string {
	const workspace = mkdtempSync(join(tmpdir(), "chat-mastra-mcp-bridge-"));
	cleanupPaths.push(workspace);
	return workspace;
}

describe("ensureMastraCodeMcpBridge", () => {
	it("does not delete generated config when workspace mcp config has parse errors", () => {
		const cwd = createTempWorkspace();
		const workspaceConfigPath = join(cwd, ".mcp.json");
		const mastraConfigPath = join(cwd, ".mastracode", "mcp.json");

		writeFileSync(
			workspaceConfigPath,
			JSON.stringify(
				{
					mcpServers: {
						localtest: {
							command: "zsh",
							args: ["-lc", "exit 0"],
						},
					},
				},
				null,
				2,
			),
		);
		ensureMastraCodeMcpBridge({ cwd });
		expect(existsSync(mastraConfigPath)).toBe(true);

		writeFileSync(workspaceConfigPath, "{ invalid json");
		ensureMastraCodeMcpBridge({ cwd });
		expect(existsSync(mastraConfigPath)).toBe(true);
	});

	it("threads auth token through generated server env without mutating process env", () => {
		const cwd = createTempWorkspace();
		const workspaceConfigPath = join(cwd, ".mcp.json");
		const mastraConfigPath = join(cwd, ".mastracode", "mcp.json");
		const oldToken = process.env.SUPERSET_MCP_AUTH_TOKEN;
		delete process.env.SUPERSET_MCP_AUTH_TOKEN;

		try {
			writeFileSync(
				workspaceConfigPath,
				JSON.stringify(
					{
						mcpServers: {
							superset: {
								type: "http",
								url: "https://api.superset.sh/api/agent/mcp",
							},
						},
					},
					null,
					2,
				),
			);

			const debug = getMastraCodeMcpBridgeDebugInfo(cwd);
			if (!debug.remoteBridgeCommand) return;

			ensureMastraCodeMcpBridge({ cwd, authToken: "test-token" });
			expect(process.env.SUPERSET_MCP_AUTH_TOKEN).toBeUndefined();
			expect(existsSync(mastraConfigPath)).toBe(true);

			const parsed = JSON.parse(readFileSync(mastraConfigPath, "utf-8")) as {
				mcpServers?: Record<
					string,
					{ args?: string[]; env?: Record<string, string> }
				>;
			};
			const superset = parsed.mcpServers?.superset;
			expect(superset?.env?.SUPERSET_MCP_AUTH_TOKEN).toBe("test-token");
			expect(superset?.args).toContain(SUPERSET_AUTH_HEADER);
		} finally {
			if (oldToken) {
				process.env.SUPERSET_MCP_AUTH_TOKEN = oldToken;
			} else {
				delete process.env.SUPERSET_MCP_AUTH_TOKEN;
			}
		}
	});
});
