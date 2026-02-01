import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { WebClient } from "@slack/web-api";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";
import type { AgentAction } from "../slack-blocks";
import {
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

const SLACK_GET_CHANNEL_HISTORY_TOOL: Anthropic.Tool = {
	name: "slack_get_channel_history",
	description:
		"Get recent messages from the current Slack channel. Use this to understand what the team has been discussing.",
	input_schema: {
		type: "object" as const,
		properties: {
			limit: {
				type: "number",
				description: "Number of messages to retrieve (default 20, max 100)",
			},
		},
		required: [],
	},
};

async function handleGetChannelHistory({
	token,
	channelId,
	limit = 20,
}: {
	token: string;
	channelId: string;
	limit?: number;
}): Promise<string> {
	const slack = new WebClient(token);
	const result = await slack.conversations.history({
		channel: channelId,
		limit: Math.min(limit, 100),
	});

	if (!result.messages || result.messages.length === 0) {
		return JSON.stringify({ messages: [] });
	}

	const messages = result.messages.map((msg) => ({
		user: msg.user,
		text: msg.text,
		ts: msg.ts,
		thread_ts: msg.thread_ts,
	}));

	return JSON.stringify({ messages });
}

const SYSTEM_PROMPT = `You are a helpful assistant in Slack for Superset, a task management application.

You can:
- Create, update, search, and manage tasks using superset_* tools
- Read recent channel messages using slack_get_channel_history
- Search the web for current information using web_search
- Help users understand conversations and create actionable items from discussions

Guidelines:
- Be concise and clear (this is Slack, not email)
- When creating tasks, extract key details from the conversation
- Use Slack formatting: *bold*, _italic_, \`code\`, > quotes
- If an action fails, explain what went wrong and suggest alternatives
- When answering questions that need up-to-date info, use web_search to find current information
- Cite sources when sharing information from web search results

Context gathering:
- Thread context is automatically included if the mention is in a thread
- Use slack_get_channel_history to read recent channel messages for additional context
- Don't ask the user for context you can find yourself - be proactive`;

export async function runSlackAgent(
	params: RunSlackAgentParams,
): Promise<SlackAgentResult> {
	const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
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

	try {
		const [threadContext, supersetMcpResult] = await Promise.all([
			fetchThreadContext({
				token: params.slackToken,
				channelId: params.channelId,
				threadTs: params.threadTs,
			}),
			createSupersetMcpClient({
				organizationId: params.organizationId,
				userId: connection.connectedByUserId,
			}),
		]);

		supersetMcp = supersetMcpResult.client;
		cleanupSuperset = supersetMcpResult.cleanup;

		const supersetToolsResult = await supersetMcp.listTools();

		const supersetTools = supersetToolsResult.tools
			.map((t) => mcpToolToAnthropicTool(t, "superset"))
			.filter((t) => !DENIED_SUPERSET_TOOLS.has(t.name));

		const tools: Anthropic.Messages.ToolUnion[] = [
			...supersetTools,
			SLACK_GET_CHANNEL_HISTORY_TOOL,
			{
				type: "web_search_20250305" as const,
				name: "web_search" as const,
				max_uses: 3,
			},
		];

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
			(response.stop_reason === "tool_use" ||
				response.stop_reason === "pause_turn") &&
			iterations < MAX_TOOL_ITERATIONS
		) {
			iterations++;

			// pause_turn: server-side tool (web search) paused a long-running turn
			if (response.stop_reason === "pause_turn") {
				messages.push({ role: "assistant", content: response.content });
				response = await anthropic.messages.create({
					model: "claude-sonnet-4-5",
					max_tokens: 2048,
					system: contextualSystem,
					tools,
					messages,
				});
				continue;
			}

			// tool_use: handle client-side tools (MCP + slack_get_channel_history)
			const toolUseBlocks = response.content.filter(
				(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
			);

			const toolResults: Anthropic.ToolResultBlockParam[] = [];

			for (const toolUse of toolUseBlocks) {
				try {
					let resultContent: string;

					if (toolUse.name === "slack_get_channel_history") {
						const input = toolUse.input as { limit?: number };
						resultContent = await handleGetChannelHistory({
							token: params.slackToken,
							channelId: params.channelId,
							limit: input.limit,
						});
					} else {
						const { prefix, toolName } = parseToolName(toolUse.name);

						if (prefix !== "superset" || !supersetMcp) {
							toolResults.push({
								type: "tool_result",
								tool_use_id: toolUse.id,
								content: JSON.stringify({
									error: `Unknown tool: ${toolUse.name}`,
								}),
								is_error: true,
							});
							continue;
						}

						const result = await supersetMcp.callTool({
							name: toolName,
							arguments: toolUse.input as Record<string, unknown>,
						});

						resultContent = JSON.stringify(result.content);

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
	}
}
