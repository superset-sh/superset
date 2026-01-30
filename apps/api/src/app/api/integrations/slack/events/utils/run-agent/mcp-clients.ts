import type Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createInMemoryMcpClient } from "@superset/mcp/in-memory";

interface McpTool {
	name: string;
	description?: string;
	inputSchema: unknown;
}

// Uses InMemoryTransport — no HTTP, no forgeable headers.
export async function createSupersetMcpClient({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): Promise<{ client: Client; cleanup: () => Promise<void> }> {
	return createInMemoryMcpClient({ organizationId, userId });
}

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
