import type Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpContext } from "@superset/mcp/auth";
import { createInMemoryMcpClient as createV1Client } from "@superset/mcp/in-memory";
import { createInMemoryMcpClient as createV2Client } from "@superset/mcp-v2/in-memory";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";

interface McpTool {
	name: string;
	description?: string;
	inputSchema: unknown;
}

const SLACK_CLIENT_LABEL = "slack-agent";

// Uses InMemoryTransport — no HTTP, no forgeable headers.
export async function createSupersetMcpClient({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): Promise<{ client: Client; cleanup: () => Promise<void> }> {
	return createV1Client({
		organizationId,
		userId,
		source: "slack",
		onToolCall: (toolName: string, ctx: McpContext) => {
			posthog.capture({
				distinctId: ctx.userId,
				event: "mcp_tool_called",
				properties: {
					tool_name: toolName,
					source: ctx.source,
					org_id: ctx.organizationId,
				},
			});
		},
	});
}

export async function createSupersetMcpV2Client({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): Promise<{ client: Client; cleanup: () => Promise<void> }> {
	return createV2Client({
		organizationId,
		userId,
		clientLabel: SLACK_CLIENT_LABEL,
		relayUrl: env.RELAY_URL,
		onToolCall: (event) => {
			posthog.capture({
				distinctId: event.userId,
				event: "mcp_tool_called",
				properties: {
					tool: event.toolName,
					organization_id: event.organizationId,
					auth_source: event.source,
					client_label: event.clientLabel,
					duration_ms: event.durationMs,
					success: event.success,
					error_message: event.errorMessage,
					mcp_server: "superset-v2",
				},
				groups: { organization: event.organizationId },
			});
		},
	});
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
