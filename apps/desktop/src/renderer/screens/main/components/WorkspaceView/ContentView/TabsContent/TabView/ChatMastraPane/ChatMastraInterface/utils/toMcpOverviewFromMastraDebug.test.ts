import { describe, expect, it } from "bun:test";
import { toMcpOverviewFromMastraDebug } from "./toMcpOverviewFromMastraDebug";

type McpDebugInput = Parameters<typeof toMcpOverviewFromMastraDebug>[0];
const SUPERSET_AUTH_HEADER =
	"Authorization: Bearer " + "$" + "{SUPERSET_MCP_AUTH_TOKEN}";

function createDebugFixture(
	overrides: Partial<McpDebugInput> = {},
): McpDebugInput {
	return {
		cwd: "/repo",
		bridge: {
			cwd: "/repo",
			workspaceConfigPath: "/repo/.mcp.json",
			mastraConfigPath: "/repo/.mastracode/mcp.json",
			workspaceConfigExists: true,
			mastraConfigExists: true,
			workspaceConfigParseError: false,
			mastraConfigParseError: false,
			mastraConfigManagedByBridge: true,
			workspaceServerNames: [],
			mastraServerNames: [],
			supersetAuthEnvPresent: false,
			remoteBridgeCommand: "bunx",
		},
		manager: {
			present: true,
			hasServers: false,
			configPaths: null,
			configuredServerNames: [],
			serverConfigs: {},
			statuses: [],
		},
		...overrides,
	};
}

describe("toMcpOverviewFromMastraDebug", () => {
	it("prefers manager project config path when present", () => {
		const debug = createDebugFixture({
			manager: {
				present: true,
				hasServers: false,
				configPaths: {
					project: "/repo/.mastracode/mcp.json",
					global: "/Users/me/.mastracode/mcp.json",
					claude: "/repo/.claude/settings.local.json",
				},
				configuredServerNames: [],
				serverConfigs: {},
				statuses: [],
			},
		});

		const result = toMcpOverviewFromMastraDebug(debug);
		expect(result.sourcePath).toBe("/repo/.mastracode/mcp.json");
	});

	it("maps remote/local servers, status, and error details", () => {
		const debug = createDebugFixture({
			bridge: {
				cwd: "/repo",
				workspaceConfigPath: "/repo/.mcp.json",
				mastraConfigPath: "/repo/.mastracode/mcp.json",
				workspaceConfigExists: true,
				mastraConfigExists: true,
				workspaceConfigParseError: false,
				mastraConfigParseError: false,
				mastraConfigManagedByBridge: true,
				workspaceServerNames: ["superset", "maestro", "workspace-only"],
				mastraServerNames: ["superset", "maestro"],
				supersetAuthEnvPresent: true,
				remoteBridgeCommand: "bunx",
			},
			manager: {
				present: true,
				hasServers: true,
				configPaths: null,
				configuredServerNames: ["superset", "maestro"],
				serverConfigs: {
					superset: {
						command: "bunx",
						args: [
							"mcp-remote",
							"https://api.superset.sh/api/agent/mcp",
							"--header",
							SUPERSET_AUTH_HEADER,
						],
					},
					maestro: {
						command: "maestro",
						args: ["mcp"],
					},
				},
				statuses: [
					{
						name: "superset",
						connected: true,
						toolCount: 3,
						toolNames: ["superset_query"],
					},
					{
						name: "maestro",
						connected: false,
						toolCount: 0,
						toolNames: [],
						error: "spawn maestro ENOENT\nstack line 2",
					},
				],
			},
		});

		const result = toMcpOverviewFromMastraDebug(debug);
		expect(result.sourcePath).toBe("/repo/.mastracode/mcp.json");
		expect(result.servers).toEqual([
			{
				name: "maestro",
				state: "invalid",
				transport: "local",
				target: "maestro mcp (spawn maestro ENOENT)",
			},
			{
				name: "superset",
				state: "enabled",
				transport: "remote",
				target: "https://api.superset.sh/api/agent/mcp",
			},
			{
				name: "workspace-only",
				state: "disabled",
				transport: "unknown",
				target: "Not loaded by MastraCode runtime",
			},
		]);
	});
});
