import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import type { McpServerEntry } from "@superset/shared/mcp-servers";

const TOKEN_PREFIX = "@mcp/";
const SEGMENT = "[\\w-]+(?:\\.[\\w-]+)*";
const TOKEN_PATTERN = new RegExp(
	`(^|[\\s([{])(${TOKEN_PREFIX}${SEGMENT}(?:/${SEGMENT})?)(?=$|[\\s)\\]}.!?;,:])`,
	"g",
);

type McpChipData = { elementKind: "other"; mcpServer: string };

function tokenSafe(value: string): string {
	return value.replace(/[^\w.-]+/g, "-").replace(/^\.+|\.+$/g, "") || "server";
}

export function mcpServerToken(
	server: Pick<McpServerEntry, "name" | "agent" | "scope">,
	servers: readonly Pick<McpServerEntry, "name" | "agent" | "scope">[],
): string {
	const name = tokenSafe(server.name);
	const namesakes = servers.filter(
		(other) => other.agent === server.agent && tokenSafe(other.name) === name,
	);
	return namesakes.length <= 1
		? `${TOKEN_PREFIX}${name}`
		: `${TOKEN_PREFIX}${server.scope}/${name}`;
}

export function mcpServerChip(
	serverName: string,
	token: string,
	iconUrl?: string,
): ComposerChip {
	return {
		label: serverName,
		serialized: token,
		...(iconUrl ? { iconUrl } : {}),
		data: { elementKind: "other", mcpServer: serverName } satisfies McpChipData,
	};
}

export function mcpServerOfChip(chip: ComposerChip): string | null {
	const server = (chip.data as Partial<McpChipData> | undefined)?.mcpServer;
	return typeof server === "string" ? server : null;
}

export interface McpTokenMatch {
	start: number;
	end: number;
	token: string;
	name: string;
}

export function findMcpServerTokens(text: string): McpTokenMatch[] {
	return [...text.matchAll(TOKEN_PATTERN)].map((match) => {
		const token = match[2] ?? "";
		const start = (match.index ?? 0) + (match[1]?.length ?? 0);
		return {
			start,
			end: start + token.length,
			token,
			name: token.slice(token.lastIndexOf("/") + 1),
		};
	});
}

const CONTEXT_PREFIX = "MCP context: ";
export function mcpContextLine(serverNames: readonly string[]): string | null {
	const names = [...new Set(serverNames)];
	if (names.length === 0) return null;
	const list = names.map((name) => JSON.stringify(name)).join(", ");
	return `${CONTEXT_PREFIX}Use the configured MCP server${names.length === 1 ? "" : "s"} ${list} when relevant to this request.`;
}

function withoutMcpContext(text: string): string {
	if (!text.startsWith(CONTEXT_PREFIX)) return text;
	const end = text.indexOf("\n\n");
	return end === -1 ? "" : text.slice(end + 2);
}

/**
 * A recalled or edited message can still carry the line from its first
 * send, so it is replaced rather than stacked.
 */
export function withMcpContext(
	text: string,
	serverNames: readonly string[],
): string {
	const body = withoutMcpContext(text);
	const context = mcpContextLine(serverNames);
	return context ? `${context}\n\n${body}` : body;
}
