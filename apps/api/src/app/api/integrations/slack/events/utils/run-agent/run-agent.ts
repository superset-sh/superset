import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { WebClient } from "@slack/web-api";

import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import type { AgentAction } from "../slack-blocks";
import {
	createSlackMcpClient,
	createSupersetMcpClient,
	mcpToolToAnthropicTool,
	parseToolName,
} from "./mcp-clients";

async function fetchThreadContext({
	token,
	channelId,
	threadTs,
	limit = 20,
}: {
	token: string;
	channelId: string;
	threadTs: string;
	limit?: number;
}): Promise<string> {
	try {
		const slack = new WebClient(token);
		const result = await slack.conversations.replies({
			channel: channelId,
			ts: threadTs,
			limit,
		});

		if (!result.messages || result.messages.length === 0) {
			return "";
		}

		// Exclude the current mention (last message)
		const messages = result.messages.slice(0, -1);
		if (messages.length === 0) {
			return "";
		}

		const formatted = messages
			.map((msg) => `<${msg.user}>: ${msg.text}`)
			.join("\n");

		return `--- Thread Context (${messages.length} previous messages) ---\n${formatted}\n--- End Thread Context ---`;
	} catch (error) {
		console.warn("[slack-agent] Failed to fetch thread context:", error);
		return "";
	}
}

interface RunSlackAgentParams {
	prompt: string;
	channelId: string;
	threadTs: string;
	organizationId: string;
	slackToken: string;
	slackTeamId: string;
}

export interface SlackAgentResult {
	text: string;
	actions: AgentAction[];
}

function getActionFromToolResult(
	toolName: string,
	// biome-ignore lint/suspicious/noExplicitAny: MCP result varies by tool
	result: any,
): AgentAction | null {
	const data = result.structuredContent ?? parseTextContent(result.content);
	if (!data) return null;

	if (toolName === "create_task" && data.created) {
		return {
			type: "task_created",
			tasks: data.created.map(
				(t: { id: string; slug: string; title: string }) => ({
					id: t.id,
					slug: t.slug,
					title: t.title,
					status: "Backlog",
				}),
			),
		};
	}

	if (toolName === "update_task" && data.updated) {
		return {
			type: "task_updated",
			tasks: data.updated.map(
				(t: { id: string; slug: string; title: string }) => ({
					id: t.id,
					slug: t.slug,
					title: t.title,
				}),
			),
		};
	}

	if (toolName === "create_workspace" && data.workspaceId) {
		return {
			type: "workspace_created",
			workspaces: [
				{
					id: data.workspaceId,
					name: data.workspaceName,
					branch: data.branch,
				},
			],
		};
	}

	if (
		(toolName === "switch_workspace" || toolName === "navigate_to_workspace") &&
		data.workspaceId
	) {
		return {
			type: "workspace_switched",
			workspaces: [
				{
					id: data.workspaceId,
					name: data.workspaceName,
					branch: data.branch,
				},
			],
		};
	}

	return null;
}

// biome-ignore lint/suspicious/noExplicitAny: MCP content is loosely typed
function parseTextContent(content: any): Record<string, unknown> | null {
	try {
		const contentItem = content?.[0];
		if (
			!contentItem ||
			typeof contentItem !== "object" ||
			!("text" in contentItem)
		) {
			return null;
		}
		return JSON.parse(contentItem.text as string);
	} catch {
		return null;
	}
}

// Desktop-only tools that don't make sense in Slack context
const DENIED_SUPERSET_TOOLS = new Set([
	"navigate_to_workspace",
	"switch_workspace",
	"get_app_context",
]);

const SYSTEM_PROMPT = `You are a helpful assistant in Slack for Superset, a task management application.

You can:
- Create, update, search, and manage tasks using superset_* tools
- Read Slack messages and context using slack_* tools
- Help users understand conversations and create actionable items from discussions

Guidelines:
- Be concise and clear (this is Slack, not email)
- When creating tasks, extract key details from the conversation
- Use Slack formatting: *bold*, _italic*, \`code\`, > quotes
- If an action fails, explain what went wrong and suggest alternatives

Context gathering:
- If the user's request references something you don't have context for (a person, a conversation, a decision, etc.), USE THE SLACK TOOLS to find it
- Use slack_search_messages to find relevant discussions by keyword
- Use slack_get_channel_history to read recent channel messages
- Use slack_get_thread_replies to get full thread context
- Use slack_get_users to look up user details when names are mentioned
- Don't ask the user for context you can find yourself - be proactive

Available tool prefixes:
- superset_*: Task management tools (create_task, list_tasks, update_task, etc.)
- slack_*: Slack tools (get_channel_history, search_messages, get_thread, etc.)`;

export async function runSlackAgent(
	params: RunSlackAgentParams,
): Promise<SlackAgentResult> {
	const anthropic = new Anthropic();
	const actions: AgentAction[] = [];

	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, params.organizationId),
			eq(integrationConnections.provider, "slack"),
		),
		columns: { connectedByUserId: true },
	});

	if (!connection) {
		throw new Error("Slack connection not found");
	}

	let supersetMcp: Client | null = null;
	let cleanupSuperset: (() => Promise<void>) | null = null;
	let slackMcp: Client | null = null;

	try {
		const [threadContext, supersetMcpResult, slackMcpResult] =
			await Promise.all([
				fetchThreadContext({
					token: params.slackToken,
					channelId: params.channelId,
					threadTs: params.threadTs,
				}),
				createSupersetMcpClient({
					organizationId: params.organizationId,
					userId: connection.connectedByUserId,
				}),
				createSlackMcpClient({
					token: params.slackToken,
					teamId: params.slackTeamId,
				}),
			]);

		supersetMcp = supersetMcpResult.client;
		cleanupSuperset = supersetMcpResult.cleanup;
		slackMcp = slackMcpResult;

		const [supersetToolsResult, slackToolsResult] = await Promise.all([
			supersetMcp.listTools(),
			slackMcp.listTools(),
		]);

		const supersetTools = supersetToolsResult.tools
			.map((t) => mcpToolToAnthropicTool(t, "superset"))
			.filter((t) => !DENIED_SUPERSET_TOOLS.has(t.name));

		const slackTools = slackToolsResult.tools.map((t) =>
			mcpToolToAnthropicTool(t, "slack"),
		);

		const tools: Anthropic.Tool[] = [...supersetTools, ...slackTools];

		const contextualSystem = `${SYSTEM_PROMPT}

Current context:
- Slack Channel: ${params.channelId}
- Thread: ${params.threadTs}
- Organization ID: ${params.organizationId}`;

		const userContent = threadContext
			? `${threadContext}\n\nCurrent message:\n${params.prompt}`
			: params.prompt;

		const messages: Anthropic.MessageParam[] = [
			{
				role: "user",
				content: userContent,
			},
		];

		let response = await anthropic.messages.create({
			model: "claude-sonnet-4-5",
			max_tokens: 2048,
			system: contextualSystem,
			tools,
			messages,
		});

		const MAX_TOOL_ITERATIONS = 10;
		let iterations = 0;

		while (
			response.stop_reason === "tool_use" &&
			iterations < MAX_TOOL_ITERATIONS
		) {
			iterations++;
			const toolUseBlocks = response.content.filter(
				(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
			);

			const toolResults: Anthropic.ToolResultBlockParam[] = [];

			for (const toolUse of toolUseBlocks) {
				const { prefix, toolName } = parseToolName(toolUse.name);
				const mcp = prefix === "superset" ? supersetMcp : slackMcp;

				if (!mcp) {
					toolResults.push({
						type: "tool_result",
						tool_use_id: toolUse.id,
						content: JSON.stringify({
							error: `Unknown tool prefix: ${prefix}`,
						}),
						is_error: true,
					});
					continue;
				}

				try {
					const result = await mcp.callTool({
						name: toolName,
						arguments: toolUse.input as Record<string, unknown>,
					});

					const resultContent = JSON.stringify(result.content);

					if (prefix === "superset") {
						const action = getActionFromToolResult(toolName, result);
						if (action) {
							actions.push(action);
						}
					}

					toolResults.push({
						type: "tool_result",
						tool_use_id: toolUse.id,
						content: resultContent,
					});
				} catch (error) {
					console.error(
						"[slack-agent] Tool execution error:",
						toolUse.name,
						error,
					);
					toolResults.push({
						type: "tool_result",
						tool_use_id: toolUse.id,
						content: JSON.stringify({
							error:
								error instanceof Error
									? error.message
									: "Tool execution failed",
						}),
						is_error: true,
					});
				}
			}

			messages.push({ role: "assistant", content: response.content });
			messages.push({ role: "user", content: toolResults });

			response = await anthropic.messages.create({
				model: "claude-sonnet-4-5",
				max_tokens: 2048,
				system: contextualSystem,
				tools,
				messages,
			});
		}

		const textBlock = response.content.find(
			(b): b is Anthropic.TextBlock => b.type === "text",
		);

		return {
			text: textBlock?.text ?? "Done!",
			actions,
		};
	} finally {
		if (cleanupSuperset) {
			try {
				await cleanupSuperset();
			} catch {}
		}
		if (slackMcp) {
			try {
				await slackMcp.close();
			} catch {}
		}
	}
}
