import type Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { env } from "@/env";

interface McpTool {
	name: string;
	description?: string;
	inputSchema: unknown;
}

/**
 * Creates an MCP client connected to the Superset MCP server via HTTP.
 * Uses a service-level authentication bypass for internal agent calls.
 */
export async function createSupersetMcpClient({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): Promise<Client> {
	const transport = new StreamableHTTPClientTransport(
		new URL(`${env.NEXT_PUBLIC_API_URL}/api/agent/mcp`),
		{
			requestInit: {
				headers: {
					// Pass context as headers for internal service calls
					"X-Internal-Organization-Id": organizationId,
					"X-Internal-User-Id": userId,
				},
			},
		},
	);

	const client = new Client({
		name: "slack-agent-superset",
		version: "1.0.0",
	});

	await client.connect(transport);
	return client;
}

/**
 * Creates an MCP client for Slack by spawning the official Slack MCP server.
 * Uses the @modelcontextprotocol/server-slack package via npx.
 */
export async function createSlackMcpClient({
	token,
	teamId,
}: {
	token: string;
	teamId: string;
}): Promise<Client> {
	const transport = new StdioClientTransport({
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-slack"],
		env: {
			...process.env,
			SLACK_BOT_TOKEN: token,
			SLACK_TEAM_ID: teamId,
		},
	});

	const client = new Client({
		name: "slack-agent-slack",
		version: "1.0.0",
	});

	await client.connect(transport);
	return client;
}

/**
 * Converts an MCP tool definition to the Anthropic API tool format.
 * Prefixes tool names with the source (superset_ or slack_) for disambiguation.
 */
export function mcpToolToAnthropicTool(
	tool: McpTool,
	prefix: string,
): Anthropic.Tool {
	return {
		name: `${prefix}_${tool.name}`,
		description: tool.description ?? "",
		input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
	};
}

/**
 * Parses a prefixed tool name back to the original name and source.
 */
export function parseToolName(prefixedName: string): {
	prefix: string;
	toolName: string;
} {
	const underscoreIndex = prefixedName.indexOf("_");
	if (underscoreIndex === -1) {
		return { prefix: prefixedName, toolName: "" };
	}
	const prefix = prefixedName.slice(0, underscoreIndex);
	const toolName = prefixedName.slice(underscoreIndex + 1);
	return { prefix, toolName };
}
