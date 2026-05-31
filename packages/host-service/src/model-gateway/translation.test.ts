import { describe, expect, it } from "bun:test";
import {
	buildAnthropicResponseFromUpstream,
	buildAnthropicSseFromMessage,
	buildOpenAIChatRequest,
	buildOpenAIResponsesRequest,
} from "./translation";

describe("model gateway translation", () => {
	it("maps Anthropic messages and tools to OpenAI Chat", () => {
		const request = buildOpenAIChatRequest({
			model: "gpt-5.5",
			system: "You are useful.",
			messages: [
				{ role: "user", content: "hello" },
				{
					role: "assistant",
					content: [
						{ type: "text", text: "need a tool" },
						{
							type: "tool_use",
							id: "toolu_1",
							name: "read_file",
							input: { path: "README.md" },
						},
					],
				},
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_1",
							content: "contents",
						},
					],
				},
			],
			tools: [
				{
					name: "read_file",
					description: "Read a file",
					input_schema: { type: "object" },
				},
			],
		});

		expect(request.model).toBe("gpt-5.5");
		expect(request.tools).toEqual([
			{
				type: "function",
				function: {
					name: "read_file",
					description: "Read a file",
					parameters: { type: "object" },
				},
			},
		]);
		expect(request.messages).toContainEqual({
			role: "tool",
			tool_call_id: "toolu_1",
			content: "contents",
		});
	});

	it("maps Anthropic messages to OpenAI Responses input", () => {
		const request = buildOpenAIResponsesRequest({
			model: "gpt-5.5",
			system: "System text",
			messages: [{ role: "user", content: "hello" }],
		});

		expect(request.model).toBe("gpt-5.5");
		expect(request.input).toContain("hello");
		expect(request.instructions).toBe("System text");
	});

	it("maps OpenAI Chat responses back to Anthropic message shape", () => {
		const response = buildAnthropicResponseFromUpstream({
			protocol: "openai-chat",
			requestModel: "gpt-5.5",
			upstream: {
				id: "chatcmpl_1",
				choices: [
					{
						message: {
							content: "done",
							tool_calls: [
								{
									id: "call_1",
									function: {
										name: "write_file",
										arguments: '{"path":"a.txt"}',
									},
								},
							],
						},
					},
				],
				usage: { prompt_tokens: 3, completion_tokens: 4 },
			},
		});

		expect(response.content).toEqual([
			{ type: "text", text: "done" },
			{
				type: "tool_use",
				id: "call_1",
				name: "write_file",
				input: { path: "a.txt" },
			},
		]);
		expect(response.stop_reason).toBe("tool_use");
	});

	it("can synthesize Anthropic SSE from a translated message", () => {
		const sse = buildAnthropicSseFromMessage({
			type: "message",
			role: "assistant",
			content: [{ type: "text", text: "hello" }],
			stop_reason: "end_turn",
		});

		expect(sse).toContain("event: message_start");
		expect(sse).toContain("event: content_block_delta");
		expect(sse).toContain("hello");
		expect(sse).toContain("event: message_stop");
	});
});
