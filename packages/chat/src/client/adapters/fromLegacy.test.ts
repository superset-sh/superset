import { describe, expect, it } from "bun:test";
import type { ToolPart } from "../../shared/types";
import {
	dedupeOptimisticUserMessages,
	fromLegacyMessages,
	type LegacyMessage,
} from "./fromLegacy";

const SESSION = "sess_01";

function atDate(iso: string): Date {
	return new Date(iso);
}

describe("fromLegacyMessages — basic user/assistant pairs", () => {
	it("converts a user text message with file + image attachments", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: atDate("2026-04-21T10:00:00Z"),
				content: [
					{ type: "text", text: "please look at this" },
					{
						type: "image",
						mimeType: "image/png",
						data: "iVBORw0KGgoAAA==",
					},
					{
						type: "file",
						mediaType: "text/plain",
						filename: "notes.txt",
						data: "aGVsbG8=",
					},
				],
			},
		];
		const out = fromLegacyMessages(legacy, { sessionID: SESSION });

		expect(out.messages).toHaveLength(1);
		const msg = out.messages[0];
		if (!msg || msg.role !== "user") throw new Error("expected user msg");
		expect(msg.sessionID).toBe(SESSION);

		const parts = out.parts.u1;
		expect(parts).toHaveLength(3);
		expect(parts?.[0]?.type).toBe("text");
		expect(parts?.[1]?.type).toBe("image");
		expect(parts?.[2]?.type).toBe("file");
	});

	it("links assistant messages to the preceding user message via parentID", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: "2026-04-21T10:00:00Z",
				content: [{ type: "text", text: "hi" }],
			},
			{
				id: "a1",
				role: "assistant",
				createdAt: "2026-04-21T10:00:01Z",
				stopReason: "finish",
				model: "claude-sonnet-4-6",
				provider: "anthropic",
				content: [{ type: "text", text: "hello!" }],
			},
		];
		const out = fromLegacyMessages(legacy, { sessionID: SESSION });

		const asst = out.messages[1];
		if (!asst || asst.role !== "assistant") {
			throw new Error("expected assistant");
		}
		expect(asst.parentID).toBe("u1");
		expect(asst.modelID).toBe("claude-sonnet-4-6");
		expect(asst.providerID).toBe("anthropic");
		expect(asst.time.completed).toBeDefined();
		expect(asst.error).toBeUndefined();
	});

	it("surfaces an assistant error as message.error", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: "2026-04-21T10:00:00Z",
				content: [{ type: "text", text: "hi" }],
			},
			{
				id: "a1",
				role: "assistant",
				createdAt: "2026-04-21T10:00:01Z",
				stopReason: "error",
				errorMessage: "provider rate-limited",
				content: [],
			},
		];
		const out = fromLegacyMessages(legacy, { sessionID: SESSION });
		const asst = out.messages[1];
		if (!asst || asst.role !== "assistant") {
			throw new Error("expected assistant");
		}
		expect(asst.error?.message).toBe("provider rate-limited");
		expect(asst.error?.kind).toBe("unknown");
		expect(asst.time.completed).toBeUndefined();
	});

	it("drops system/tool-role messages silently", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "s1",
				role: "system",
				createdAt: "2026-04-21T10:00:00Z",
				content: [{ type: "text", text: "system prompt" }],
			},
			{
				id: "u1",
				role: "user",
				createdAt: "2026-04-21T10:00:01Z",
				content: [{ type: "text", text: "hi" }],
			},
		];
		const out = fromLegacyMessages(legacy, { sessionID: SESSION });
		expect(out.messages.map((m) => m.id)).toEqual(["u1"]);
	});
});

describe("fromLegacyMessages — tool calls", () => {
	it("pairs tool_call + tool_result into a single completed ToolPart", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: 1000,
				content: [{ type: "text", text: "run ls" }],
			},
			{
				id: "a1",
				role: "assistant",
				createdAt: 2000,
				stopReason: "finish",
				content: [
					{ type: "tool_call", id: "tc1", name: "shell", args: { cmd: "ls" } },
					{
						type: "tool_result",
						id: "tc1",
						result: { stdout: "file1\nfile2", exit: 0 },
					},
					{ type: "text", text: "here are your files" },
				],
			},
		];
		const out = fromLegacyMessages(legacy, { sessionID: SESSION });
		const parts = out.parts.a1;
		expect(parts?.map((p) => p.type)).toEqual(["tool", "text"]);

		const tool = parts?.[0] as ToolPart;
		expect(tool.tool).toBe("shell");
		expect(tool.state.kind).toBe("completed");
		expect(tool.state.input).toEqual({ cmd: "ls" });
		if (tool.state.kind === "completed") {
			expect(tool.state.output).toEqual({ stdout: "file1\nfile2", exit: 0 });
		}
	});

	it("renders a tool_result with isError as an error ToolState with extracted message", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: 1000,
				content: [{ type: "text", text: "bad cmd" }],
			},
			{
				id: "a1",
				role: "assistant",
				createdAt: 2000,
				content: [
					{
						type: "tool_call",
						id: "tc1",
						name: "shell",
						args: { cmd: "false" },
					},
					{
						type: "tool_result",
						id: "tc1",
						isError: true,
						result: { message: "exit 1" },
					},
				],
			},
		];
		const tool = fromLegacyMessages(legacy, { sessionID: SESSION })
			.parts.a1?.[0] as ToolPart;
		expect(tool.state.kind).toBe("error");
		if (tool.state.kind === "error") {
			expect(tool.state.error.message).toBe("exit 1");
		}
	});

	it("tool_call without a result renders as running when session is idle", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: 1000,
				content: [{ type: "text", text: "ok" }],
			},
			{
				id: "a1",
				role: "assistant",
				createdAt: 2000,
				content: [
					{ type: "tool_call", id: "tc1", name: "shell", args: { cmd: "ls" } },
				],
			},
		];
		const tool = fromLegacyMessages(legacy, { sessionID: SESSION })
			.parts.a1?.[0] as ToolPart;
		expect(tool.state.kind).toBe("running");
	});

	it("tool_call without a result renders as input-streaming when that message is actively streaming", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: 1000,
				content: [{ type: "text", text: "ok" }],
			},
			{
				id: "a1",
				role: "assistant",
				createdAt: 2000,
				content: [
					{ type: "tool_call", id: "tc1", name: "edit", args: { path: "x" } },
				],
			},
		];
		const tool = fromLegacyMessages(legacy, {
			sessionID: SESSION,
			isStreaming: true,
			activeMessageID: "a1",
		}).parts.a1?.[0] as ToolPart;
		expect(tool.state.kind).toBe("input-streaming");
	});

	it("orphaned tool_results are dropped (consumed by their paired tool_call)", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: 1000,
				content: [{ type: "text", text: "ok" }],
			},
			{
				id: "a1",
				role: "assistant",
				createdAt: 2000,
				content: [
					{ type: "tool_result", id: "orphan", result: "lol" },
					{ type: "text", text: "done" },
				],
			},
		];
		const parts = fromLegacyMessages(legacy, { sessionID: SESSION }).parts.a1;
		expect(parts?.map((p) => p.type)).toEqual(["text"]);
	});
});

describe("fromLegacyMessages — thinking", () => {
	it("converts thinking content to a reasoning part", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: 1000,
				content: [{ type: "text", text: "why" }],
			},
			{
				id: "a1",
				role: "assistant",
				createdAt: 2000,
				content: [
					{ type: "thinking", text: "Let me consider..." },
					{ type: "text", text: "Because X." },
				],
			},
		];
		const parts = fromLegacyMessages(legacy, { sessionID: SESSION }).parts.a1;
		expect(parts?.map((p) => p.type)).toEqual(["reasoning", "text"]);
		const reasoning = parts?.[0];
		if (!reasoning || reasoning.type !== "reasoning") {
			throw new Error("expected reasoning");
		}
		expect(reasoning.text).toBe("Let me consider...");
	});
});

describe("fromLegacyMessages — status derivation", () => {
	it("returns busy when isStreaming is true", () => {
		const out = fromLegacyMessages([], {
			sessionID: SESSION,
			isStreaming: true,
		});
		expect(out.status).toEqual({ type: "busy" });
	});

	it("returns idle otherwise", () => {
		const out = fromLegacyMessages([], { sessionID: SESSION });
		expect(out.status).toEqual({ type: "idle" });
	});
});

describe("fromLegacyMessages — time handling", () => {
	it("accepts Date, ISO string, and numeric epoch inputs uniformly", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: new Date("2026-04-21T10:00:00Z"),
				content: [{ type: "text", text: "d" }],
			},
			{
				id: "u2",
				role: "user",
				createdAt: "2026-04-21T10:00:01Z",
				content: [{ type: "text", text: "s" }],
			},
			{
				id: "u3",
				role: "user",
				createdAt: 1_800_000_000_000,
				content: [{ type: "text", text: "n" }],
			},
		];
		const out = fromLegacyMessages(legacy, { sessionID: SESSION });
		expect(out.messages[0]?.time.created).toBeGreaterThan(0);
		expect(out.messages[1]?.time.created).toBeGreaterThan(0);
		expect(out.messages[2]?.time.created).toBe(1_800_000_000_000);
	});
});

describe("fromLegacyMessages — data URL wrapping", () => {
	it("wraps raw base64 image data as a data: URL", () => {
		const out = fromLegacyMessages(
			[
				{
					id: "u1",
					role: "user",
					createdAt: 1000,
					content: [
						{ type: "image", mimeType: "image/jpeg", data: "abc123" },
					],
				},
			],
			{ sessionID: SESSION },
		);
		const part = out.parts.u1?.[0];
		if (!part || part.type !== "image") throw new Error("expected image");
		expect(part.url).toBe("data:image/jpeg;base64,abc123");
	});

	it("pass-through when data already looks like a data: URL", () => {
		const out = fromLegacyMessages(
			[
				{
					id: "u1",
					role: "user",
					createdAt: 1000,
					content: [
						{
							type: "image",
							mimeType: "image/png",
							data: "data:image/png;base64,PRE-ENCODED",
						},
					],
				},
			],
			{ sessionID: SESSION },
		);
		const part = out.parts.u1?.[0];
		if (!part || part.type !== "image") throw new Error("expected image");
		expect(part.url).toBe("data:image/png;base64,PRE-ENCODED");
	});
});

describe("fromLegacyMessages — id dedup (defensive)", () => {
	it("collapses id-duplicates so a double assistant message doesn't render twice", () => {
		const legacy: LegacyMessage[] = [
			{
				id: "u1",
				role: "user",
				createdAt: 1000,
				content: [{ type: "text", text: "hi" }],
			},
			{
				id: "a1",
				role: "assistant",
				createdAt: 2000,
				content: [{ type: "text", text: "first (stale)" }],
			},
			{
				id: "a1",
				role: "assistant",
				createdAt: 2000,
				content: [{ type: "text", text: "second (fresh)" }],
			},
		];
		const out = fromLegacyMessages(legacy, { sessionID: SESSION });
		expect(out.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
		const parts = out.parts.a1;
		expect(parts).toHaveLength(1);
		const textPart = parts?.[0];
		if (!textPart || textPart.type !== "text") {
			throw new Error("expected text part");
		}
		expect(textPart.text).toBe("second (fresh)"); // last occurrence wins
	});
});

describe("dedupeOptimisticUserMessages", () => {
	const real = (id: string, text: string): LegacyMessage => ({
		id,
		role: "user",
		createdAt: 1,
		content: [{ type: "text", text }],
	});
	const opt = (id: string, text: string): LegacyMessage => ({
		id: `optimistic-${id}`,
		role: "user",
		createdAt: 1,
		content: [{ type: "text", text }],
	});
	const asst = (id: string, text: string): LegacyMessage => ({
		id,
		role: "assistant",
		createdAt: 2,
		content: [{ type: "text", text }],
	});

	it("returns input unchanged when no real user messages exist", () => {
		const input = [opt("a", "hi")];
		expect(dedupeOptimisticUserMessages(input)).toEqual(input);
	});

	it("drops optimistic user message when a real user message has the same text", () => {
		const input = [
			real("u1", "earlier"),
			asst("a1", "reply"),
			opt("a", "hi"),
			real("u2", "hi"),
		];
		const out = dedupeOptimisticUserMessages(input);
		expect(out.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
	});

	it("keeps optimistic when no real match has been persisted yet", () => {
		const input = [real("u1", "earlier"), opt("a", "hi")];
		const out = dedupeOptimisticUserMessages(input);
		expect(out.map((m) => m.id)).toEqual(["u1", "optimistic-a"]);
	});

	it("also de-dupes our own opt- prefixed messages", () => {
		const input: LegacyMessage[] = [
			{
				id: "opt-abc",
				role: "user",
				createdAt: 1,
				content: [{ type: "text", text: "hello" }],
			},
			real("u-real", "hello"),
		];
		const out = dedupeOptimisticUserMessages(input);
		expect(out.map((m) => m.id)).toEqual(["u-real"]);
	});
});
