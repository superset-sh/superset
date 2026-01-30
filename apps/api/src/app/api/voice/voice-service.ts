import Anthropic from "@anthropic-ai/sdk";
import type { McpContext } from "@superset/mcp/auth";
import { OpenAI } from "openai";
import { env } from "@/env";
import {
	executeTool,
	getToolDefinitions,
	toAnthropicTools,
} from "./tool-adapter";

const SYSTEM_PROMPT = `You are a helpful voice assistant for Superset, a project management tool. You have access to tools for creating and managing tasks, workspaces, and other organizational resources. Keep responses concise and conversational — the user is speaking to you, so respond in 1-3 sentences unless the question requires more detail. When you use tools, briefly confirm what you did.`;

/**
 * SSE event types emitted during the voice pipeline.
 */
interface SSEWriter {
	write(event: string, data: unknown): void;
}

/**
 * Transcribes audio using OpenAI Whisper API.
 */
async function transcribeAudio(audioBuffer: Uint8Array): Promise<string> {
	const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

	const blob = new Blob([audioBuffer as BlobPart], { type: "audio/wav" });
	const file = new File([blob], "audio.wav", { type: "audio/wav" });

	const result = await openai.audio.transcriptions.create({
		model: "whisper-1",
		file,
	});

	// Strip wake word from transcription
	let text = result.text.trim();
	text = text.replace(/^hey\s*jarvis[,.\s!?]*/i, "").trim();
	return text;
}

/**
 * Runs the full voice pipeline: transcription → Claude with tools → streaming response.
 * Writes SSE events to the provided writer throughout.
 */
export async function runVoicePipeline({
	audioBuffer,
	ctx,
	sse,
}: {
	audioBuffer: Uint8Array;
	ctx: McpContext;
	sse: SSEWriter;
}): Promise<void> {
	// 1. Transcribe
	const transcription = await transcribeAudio(audioBuffer);
	sse.write("transcription", { text: transcription });

	if (!transcription) {
		sse.write("done", { fullResponse: "" });
		return;
	}

	// 2. Load tools
	const toolDefs = await getToolDefinitions();
	const anthropicTools = toAnthropicTools(toolDefs);

	// 3. Stream Claude response with tool use loop
	const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

	const messages: Anthropic.MessageParam[] = [
		{ role: "user", content: transcription },
	];

	let fullResponse = "";

	// Tool use loop — Claude may call tools, then we feed results back
	const MAX_TOOL_ROUNDS = 5;
	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		const stream = anthropic.messages.stream({
			model: "claude-sonnet-4-20250514",
			max_tokens: 1024,
			system: SYSTEM_PROMPT,
			messages,
			tools: anthropicTools.length > 0 ? anthropicTools : undefined,
		});

		for await (const event of stream) {
			if (event.type === "content_block_delta") {
				if (event.delta.type === "text_delta") {
					fullResponse += event.delta.text;
					sse.write("text_delta", { delta: event.delta.text });
				}
			}
		}

		// Collect the final message to check for tool use
		const finalMessage = await stream.finalMessage();
		const contentBlocks = finalMessage.content;

		// Check for tool use blocks
		const toolUseBlocks = contentBlocks.filter(
			(block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
		);

		if (toolUseBlocks.length === 0) {
			break;
		}

		// Execute each tool call and collect results
		const toolResults: Anthropic.ToolResultBlockParam[] = [];

		for (const toolBlock of toolUseBlocks) {
			sse.write("tool_use", {
				toolName: toolBlock.name,
				toolInput: toolBlock.input,
			});

			const result = await executeTool({
				toolName: toolBlock.name,
				toolInput: toolBlock.input as Record<string, unknown>,
				ctx,
				tools: toolDefs,
			});

			sse.write("tool_result", {
				toolName: toolBlock.name,
				result,
			});

			toolResults.push({
				type: "tool_result",
				tool_use_id: toolBlock.id,
				content: result,
			});
		}

		// Feed tool results back into conversation for next iteration
		messages.push({ role: "assistant", content: contentBlocks });
		messages.push({ role: "user", content: toolResults });
	}

	sse.write("done", { fullResponse });
}
