import { describe, expect, it } from "bun:test";
import type { ChunkRow } from "../../../schema";
import {
	extractTextContent,
	materializeMessage,
	messageRowToUIMessage,
	parseChunk,
} from "./materialize";

function makeRow(
	overrides: Partial<ChunkRow> & { chunk: string; seq: number },
): ChunkRow {
	return {
		id: `row-${overrides.seq}`,
		messageId: "msg-1",
		actorId: "actor-1",
		role: "assistant",
		createdAt: "2025-01-01T00:00:00Z",
		...overrides,
	};
}

describe("parseChunk", () => {
	it("parses valid JSON", () => {
		const result = parseChunk('{"type":"text-start","id":"t1"}');
		expect(result).toEqual({ type: "text-start", id: "t1" });
	});

	it("returns null for invalid JSON", () => {
		expect(parseChunk("not json")).toBeNull();
	});
});

describe("materializeMessage", () => {
	it("throws on empty rows", () => {
		expect(() => materializeMessage([])).toThrow(
			"Cannot materialize message from empty rows",
		);
	});

	it("materializes a whole-message into a MessageRow", () => {
		const row = makeRow({
			role: "user",
			seq: 0,
			chunk: JSON.stringify({
				type: "whole-message",
				message: {
					id: "msg-1",
					role: "user",
					parts: [{ type: "text", text: "Hello world" }],
				},
			}),
		});

		const result = materializeMessage([row]);

		expect(result.id).toBe("msg-1");
		expect(result.role).toBe("user");
		expect(result.isComplete).toBe(true);
		expect(result.actorId).toBe("actor-1");
		expect(result.parts).toEqual([{ type: "text", text: "Hello world" }]);
	});

	it("materializes text-start -> text-delta -> text-end -> finish", () => {
		const rows = [
			makeRow({
				seq: 0,
				chunk: JSON.stringify({ type: "text-start", id: "t1" }),
			}),
			makeRow({
				seq: 1,
				chunk: JSON.stringify({
					type: "text-delta",
					id: "t1",
					delta: "Hello ",
				}),
			}),
			makeRow({
				seq: 2,
				chunk: JSON.stringify({ type: "text-delta", id: "t1", delta: "world" }),
			}),
			makeRow({
				seq: 3,
				chunk: JSON.stringify({ type: "text-end", id: "t1" }),
			}),
			makeRow({ seq: 4, chunk: JSON.stringify({ type: "finish" }) }),
		];

		const result = materializeMessage(rows);

		expect(result.isComplete).toBe(true);
		expect(result.parts).toEqual([{ type: "text", text: "Hello world" }]);
	});

	it("materializes text-delta chunks when text-start id is missing", () => {
		const rows = [
			makeRow({
				seq: 0,
				chunk: JSON.stringify({ type: "text-start" }),
			}),
			makeRow({
				seq: 1,
				chunk: JSON.stringify({
					type: "text-delta",
					textDelta: "Hello ",
				}),
			}),
			makeRow({
				seq: 2,
				chunk: JSON.stringify({
					type: "text-delta",
					text: "world",
				}),
			}),
			makeRow({
				seq: 3,
				chunk: JSON.stringify({ type: "text-end" }),
			}),
			makeRow({ seq: 4, chunk: JSON.stringify({ type: "finish" }) }),
		];

		const result = materializeMessage(rows);
		expect(result.isComplete).toBe(true);
		expect(result.parts).toEqual([{ type: "text", text: "Hello world" }]);
	});

	it("materializes tool-input-start -> tool-input-available -> tool-output-available", () => {
		const rows = [
			makeRow({
				seq: 0,
				chunk: JSON.stringify({
					type: "tool-input-start",
					toolCallId: "tc-1",
					toolName: "readFile",
				}),
			}),
			makeRow({
				seq: 1,
				chunk: JSON.stringify({
					type: "tool-input-available",
					toolCallId: "tc-1",
					toolName: "readFile",
					input: { path: "/foo.ts" },
				}),
			}),
			makeRow({
				seq: 2,
				chunk: JSON.stringify({
					type: "tool-output-available",
					toolCallId: "tc-1",
					output: "file contents",
				}),
			}),
			makeRow({ seq: 3, chunk: JSON.stringify({ type: "finish" }) }),
		];

		const result = materializeMessage(rows);

		expect(result.isComplete).toBe(true);
		expect(result.parts).toHaveLength(1);

		const toolPart = result.parts[0] as Record<string, unknown>;
		expect(toolPart.type).toBe("dynamic-tool");
		expect(toolPart.toolName).toBe("readFile");
		expect(toolPart.toolCallId).toBe("tc-1");
		expect(toolPart.state).toBe("output-available");
		expect(toolPart.input).toEqual({ path: "/foo.ts" });
		expect(toolPart.output).toBe("file contents");
	});

	it("materializes mixed text + tool in correct order", () => {
		const rows = [
			makeRow({
				seq: 0,
				chunk: JSON.stringify({ type: "text-start", id: "t1" }),
			}),
			makeRow({
				seq: 1,
				chunk: JSON.stringify({
					type: "text-delta",
					id: "t1",
					delta: "Let me check",
				}),
			}),
			makeRow({
				seq: 2,
				chunk: JSON.stringify({ type: "text-end", id: "t1" }),
			}),
			makeRow({
				seq: 3,
				chunk: JSON.stringify({
					type: "tool-input-start",
					toolCallId: "tc-1",
					toolName: "search",
				}),
			}),
			makeRow({
				seq: 4,
				chunk: JSON.stringify({
					type: "tool-input-available",
					toolCallId: "tc-1",
					toolName: "search",
					input: { query: "foo" },
				}),
			}),
			makeRow({
				seq: 5,
				chunk: JSON.stringify({
					type: "tool-output-available",
					toolCallId: "tc-1",
					output: ["result1"],
				}),
			}),
			makeRow({
				seq: 6,
				chunk: JSON.stringify({ type: "text-start", id: "t2" }),
			}),
			makeRow({
				seq: 7,
				chunk: JSON.stringify({
					type: "text-delta",
					id: "t2",
					delta: "Found it!",
				}),
			}),
			makeRow({
				seq: 8,
				chunk: JSON.stringify({ type: "text-end", id: "t2" }),
			}),
			makeRow({ seq: 9, chunk: JSON.stringify({ type: "finish" }) }),
		];

		const result = materializeMessage(rows);

		expect(result.isComplete).toBe(true);
		expect(result.parts).toHaveLength(3);
		expect(result.parts[0]).toEqual({ type: "text", text: "Let me check" });
		expect((result.parts[1] as Record<string, unknown>).type).toBe(
			"dynamic-tool",
		);
		expect(result.parts[2]).toEqual({ type: "text", text: "Found it!" });
	});

	it("materializes reasoning parts", () => {
		const rows = [
			makeRow({
				seq: 0,
				chunk: JSON.stringify({ type: "reasoning-start", id: "r1" }),
			}),
			makeRow({
				seq: 1,
				chunk: JSON.stringify({
					type: "reasoning-delta",
					id: "r1",
					delta: "Thinking...",
				}),
			}),
			makeRow({
				seq: 2,
				chunk: JSON.stringify({
					type: "reasoning-delta",
					id: "r1",
					delta: " more thinking",
				}),
			}),
			makeRow({
				seq: 3,
				chunk: JSON.stringify({ type: "reasoning-end", id: "r1" }),
			}),
			makeRow({
				seq: 4,
				chunk: JSON.stringify({ type: "text-start", id: "t1" }),
			}),
			makeRow({
				seq: 5,
				chunk: JSON.stringify({
					type: "text-delta",
					id: "t1",
					delta: "Answer",
				}),
			}),
			makeRow({
				seq: 6,
				chunk: JSON.stringify({ type: "text-end", id: "t1" }),
			}),
			makeRow({ seq: 7, chunk: JSON.stringify({ type: "finish" }) }),
		];

		const result = materializeMessage(rows);

		expect(result.isComplete).toBe(true);
		expect(result.parts).toHaveLength(2);
		expect(result.parts[0]).toEqual({
			type: "reasoning",
			text: "Thinking... more thinking",
		});
		expect(result.parts[1]).toEqual({ type: "text", text: "Answer" });
	});

	it("handles abort as complete", () => {
		const rows = [
			makeRow({
				seq: 0,
				chunk: JSON.stringify({ type: "text-start", id: "t1" }),
			}),
			makeRow({
				seq: 1,
				chunk: JSON.stringify({
					type: "text-delta",
					id: "t1",
					delta: "partial",
				}),
			}),
			makeRow({ seq: 2, chunk: JSON.stringify({ type: "abort" }) }),
		];

		const result = materializeMessage(rows);
		expect(result.isComplete).toBe(true);
	});

	it("handles error chunks", () => {
		const rows = [
			makeRow({
				seq: 0,
				chunk: JSON.stringify({ type: "error", errorText: "something broke" }),
			}),
		];

		const result = materializeMessage(rows);
		expect(result.parts).toEqual([{ type: "error", text: "something broke" }]);
	});

	it("skips custom chunk types (config, control)", () => {
		const rows = [
			makeRow({
				seq: 0,
				chunk: JSON.stringify({ type: "config", model: "gpt-4" }),
			}),
			makeRow({
				seq: 1,
				chunk: JSON.stringify({ type: "text-start", id: "t1" }),
			}),
			makeRow({
				seq: 2,
				chunk: JSON.stringify({ type: "text-delta", id: "t1", delta: "hi" }),
			}),
			makeRow({
				seq: 3,
				chunk: JSON.stringify({ type: "text-end", id: "t1" }),
			}),
			makeRow({ seq: 4, chunk: JSON.stringify({ type: "finish" }) }),
		];

		const result = materializeMessage(rows);
		expect(result.parts).toEqual([{ type: "text", text: "hi" }]);
	});

	it("handles tool-input-delta accumulation", () => {
		const rows = [
			makeRow({
				seq: 0,
				chunk: JSON.stringify({
					type: "tool-input-start",
					toolCallId: "tc-1",
					toolName: "readFile",
				}),
			}),
			makeRow({
				seq: 1,
				chunk: JSON.stringify({
					type: "tool-input-delta",
					toolCallId: "tc-1",
					inputTextDelta: '{"path":',
				}),
			}),
			makeRow({
				seq: 2,
				chunk: JSON.stringify({
					type: "tool-input-delta",
					toolCallId: "tc-1",
					inputTextDelta: '"/foo.ts"}',
				}),
			}),
			makeRow({
				seq: 3,
				chunk: JSON.stringify({
					type: "tool-input-available",
					toolCallId: "tc-1",
					toolName: "readFile",
					input: { path: "/foo.ts" },
				}),
			}),
			makeRow({ seq: 4, chunk: JSON.stringify({ type: "finish" }) }),
		];

		const result = materializeMessage(rows);
		const toolPart = result.parts[0] as Record<string, unknown>;
		expect(toolPart.state).toBe("input-available");
		expect(toolPart.input).toEqual({ path: "/foo.ts" });
	});

	it("handles tool-approval-request", () => {
		const rows = [
			makeRow({
				seq: 0,
				chunk: JSON.stringify({
					type: "tool-input-start",
					toolCallId: "tc-1",
					toolName: "deleteFile",
				}),
			}),
			makeRow({
				seq: 1,
				chunk: JSON.stringify({
					type: "tool-input-available",
					toolCallId: "tc-1",
					toolName: "deleteFile",
					input: { path: "/important.ts" },
				}),
			}),
			makeRow({
				seq: 2,
				chunk: JSON.stringify({
					type: "tool-approval-request",
					approvalId: "apr-1",
					toolCallId: "tc-1",
				}),
			}),
		];

		const result = materializeMessage(rows);
		const toolPart = result.parts[0] as Record<string, unknown>;
		expect(toolPart.state).toBe("approval-requested");
		expect(toolPart.approval).toEqual({ id: "apr-1" });
	});
});

describe("extractTextContent", () => {
	it("extracts text from parts", () => {
		const text = extractTextContent({
			parts: [
				{ type: "text", text: "Hello " },
				{ type: "reasoning", text: "thinking..." },
				{ type: "text", text: "world" },
			],
		});
		expect(text).toBe("Hello world");
	});
});

describe("messageRowToUIMessage", () => {
	it("converts MessageRow to UIMessage with actorId", () => {
		const row = {
			id: "msg-1",
			role: "assistant" as const,
			parts: [{ type: "text" as const, text: "hi" }],
			actorId: "actor-1",
			isComplete: true,
			createdAt: new Date("2025-01-01"),
			lastChunkAt: new Date("2025-01-01"),
		};

		const msg = messageRowToUIMessage(row);
		expect(msg.id).toBe("msg-1");
		expect(msg.role).toBe("assistant");
		expect(msg.parts).toEqual([{ type: "text", text: "hi" }]);
		expect(msg.actorId).toBe("actor-1");
		expect(msg.createdAt).toEqual(new Date("2025-01-01"));
	});
});
