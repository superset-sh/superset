import type { ChatMastraServiceRouter } from "@superset/chat-mastra/server/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type {
	McpOverviewPayload,
	McpServerOverviewItem,
	McpServerState,
	McpServerTransport,
} from "../../../ChatPane/ChatInterface/types";

type SessionOutput = inferRouterOutputs<ChatMastraServiceRouter>["session"];
type McpDebugOutput = SessionOutput["mcpDebug"];
type McpServerConfig = McpDebugOutput["manager"]["serverConfigs"][string];
type McpServerStatus = McpDebugOutput["manager"]["statuses"][number];

function isRemoteServerConfig(config: McpServerConfig | null): boolean {
	if (!config) return false;
	const args = config.args ?? [];
	const remoteIndex = args.indexOf("mcp-remote");
	return remoteIndex > -1;
}

function extractRemoteTarget(config: McpServerConfig | null): string | null {
	if (!config) return null;
	const args = config.args ?? [];
	const remoteIndex = args.indexOf("mcp-remote");
	if (remoteIndex < 0) return null;
	const target = args[remoteIndex + 1];
	return typeof target === "string" && target.trim().length > 0
		? target.trim()
		: null;
}

function formatCommand(config: McpServerConfig | null): string {
	if (!config) return "Not loaded by MastraCode runtime";
	const parts = [config.command, ...(config.args ?? [])].filter(Boolean);
	return parts.join(" ").trim() || "Not loaded by MastraCode runtime";
}

function toTransport(config: McpServerConfig | null): McpServerTransport {
	if (!config) return "unknown";
	return isRemoteServerConfig(config) ? "remote" : "local";
}

function firstLine(value: string | undefined): string {
	if (!value) return "";
	return value.split("\n")[0]?.trim() ?? "";
}

function toState(input: {
	status: McpServerStatus | undefined;
	isConfigured: boolean;
}): McpServerState {
	const { status, isConfigured } = input;
	if (status?.connected) return "enabled";
	if (!isConfigured) return "disabled";
	return "invalid";
}

function toTarget(input: {
	config: McpServerConfig | null;
	status: McpServerStatus | undefined;
}): string {
	const { config, status } = input;
	if (isRemoteServerConfig(config)) {
		const remoteTarget = extractRemoteTarget(config);
		if (remoteTarget) return remoteTarget;
	}

	const base = formatCommand(config);
	if (!status?.error) return base;

	const errorSummary = firstLine(status.error);
	if (!errorSummary) return base;
	return `${base} (${errorSummary})`;
}

function collectServerNames(debug: McpDebugOutput): string[] {
	const names = new Set<string>();
	for (const name of debug.bridge.workspaceServerNames) names.add(name);
	for (const name of debug.bridge.mastraServerNames) names.add(name);
	for (const name of debug.manager.configuredServerNames) names.add(name);
	for (const status of debug.manager.statuses) names.add(status.name);
	return [...names].sort((left, right) => left.localeCompare(right));
}

export function toMcpOverviewFromMastraDebug(
	debug: McpDebugOutput,
): McpOverviewPayload {
	const statusByName = new Map(
		debug.manager.statuses.map((item) => [item.name, item]),
	);
	const configuredNames = new Set(debug.manager.configuredServerNames);
	const servers: McpServerOverviewItem[] = collectServerNames(debug).map(
		(name) => {
			const status = statusByName.get(name);
			const config = debug.manager.serverConfigs[name] ?? null;
			const isConfigured = configuredNames.has(name);

			return {
				name,
				state: toState({ status, isConfigured }),
				transport: toTransport(config),
				target: toTarget({ config, status }),
			};
		},
	);

	return {
		sourcePath:
			debug.manager.configPaths?.project ?? debug.bridge.mastraConfigPath,
		servers,
	};
}
