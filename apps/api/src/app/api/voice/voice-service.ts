import Anthropic from "@anthropic-ai/sdk";
import type { McpContext } from "@superset/mcp/auth";
import { createInMemoryMcpClient } from "@superset/mcp/in-memory";
import { OpenAI } from "openai";
import { env } from "@/env";

const SYSTEM_PROMPT = `You are a helpful voice assistant for Superset, a project management tool. You have access to tools for creating and managing tasks, workspaces, and other organizational resources. Keep responses concise and conversational — the user is speaking to you, so respond in 1-3 sentences unless the question requires more detail. When you use tools, briefly confirm what you did.`;

// Desktop-only tools that don't make sense in voice context
const DENIED_TOOLS = new Set([
	"navigate_to_workspace",
	"switch_workspace",
	"get_app_context",
]);

interface SSEWriter {
	write(event: string, data: unknown): void;
}

async function transcribeAudio({
	audioBuffer,
	signal,
}: {
	audioBuffer: Uint8Array;
	signal?: AbortSignal;
}): Promise<string> {
	const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

	const blob = new Blob([audioBuffer as BlobPart], { type: "audio/wav" });
	const file = new File([blob], "audio.wav", { type: "audio/wav" });

	const result = await openai.audio.transcriptions.create(
		{
			model: "whisper-1",
			file,
		},
		{ signal },
	);

	// Strip wake word from transcription
	let text = result.text.trim();
	text = text.replace(/^hey\s*jarvis[,.\s!?]*/i, "").trim();
	return text;
}

/**
 * Runs the full voice pipeline: transcription → Claude with MCP tools → streaming SSE.
 */
export async function runVoicePipeline({
	audioBuffer,
	ctx,
	sse,
	signal,
}: {
	audioBuffer: Uint8Array;
	ctx: McpContext;
	sse: SSEWriter;
	signal?: AbortSignal;
}): Promise<void> {
	// 1. Transcribe
	const transcription = await transcribeAudio({ audioBuffer, signal });
	sse.write("transcription", { text: transcription });

	if (!transcription) {
		sse.write("done", { fullResponse: "" });
		return;
	}

	// 2. Create in-memory MCP client for tool access
	const { client: mcpClient, cleanup } = await createInMemoryMcpClient({
		userId: ctx.userId,
		organizationId: ctx.organizationId,
	});

	try {
		const { tools: mcpTools } = await mcpClient.listTools();

		const anthropicTools: Anthropic.Tool[] = mcpTools
			.filter((t) => !DENIED_TOOLS.has(t.name))
			.map((t) => ({
				name: t.name,
				description: t.description ?? "",
				input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
			}));

		// 3. Stream Claude response with tool use loop
		const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

		const messages: Anthropic.MessageParam[] = [
			{ role: "user", content: transcription },
		];

		let fullResponse = "";

		try {
			const MAX_TOOL_ROUNDS = 5;
			for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
				if (signal?.aborted) return;

				const stream = anthropic.messages.stream(
					{
						model: "claude-sonnet-4-20250514",
						max_tokens: 1024,
						system: SYSTEM_PROMPT,
						messages,
						tools: anthropicTools.length > 0 ? anthropicTools : undefined,
					},
					{ signal },
				);

				for await (const event of stream) {
					if (event.type === "content_block_delta") {
						if (event.delta.type === "text_delta") {
							fullResponse += event.delta.text;
							sse.write("text_delta", { delta: event.delta.text });
						}
					}
				}

				const finalMessage = await stream.finalMessage();
				const contentBlocks = finalMessage.content;

				const toolUseBlocks = contentBlocks.filter(
					(block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
				);

				if (toolUseBlocks.length === 0) {
					break;
				}

				const toolResults: Anthropic.ToolResultBlockParam[] = [];

				for (const toolBlock of toolUseBlocks) {
					if (signal?.aborted) return;

					sse.write("tool_use", {
						toolName: toolBlock.name,
						toolInput: toolBlock.input,
					});

					try {
						const result = await mcpClient.callTool({
							name: toolBlock.name,
							arguments: toolBlock.input as Record<string, unknown>,
						});

						const resultText = JSON.stringify(result.content);

						sse.write("tool_result", {
							toolName: toolBlock.name,
							result: resultText,
						});

						toolResults.push({
							type: "tool_result",
							tool_use_id: toolBlock.id,
							content: resultText,
						});
					} catch (error) {
						if (signal?.aborted) return;
						console.error(
							`[voice/tool] Error executing ${toolBlock.name}:`,
							error,
						);
						const errorText = JSON.stringify({
							error:
								error instanceof Error
									? error.message
									: "Tool execution failed",
						});

						sse.write("tool_result", {
							toolName: toolBlock.name,
							result: errorText,
						});

						toolResults.push({
							type: "tool_result",
							tool_use_id: toolBlock.id,
							content: errorText,
							is_error: true,
						});
					}
				}

				messages.push({ role: "assistant", content: contentBlocks });
				messages.push({ role: "user", content: toolResults });
			}
		} catch (error) {
			if (signal?.aborted) return;
			throw error;
		}

		sse.write("done", { fullResponse });
	} finally {
		await cleanup().catch(() => {});
	}
}
