import { describe, expect, it, vi } from "vitest";
import type { AIDBSessionProtocol } from "../protocol";
import { createChunkRoutes } from "./chunks";

function createProtocolStub(
	overrides: Partial<AIDBSessionProtocol> = {},
): AIDBSessionProtocol {
	return {
		getSession: vi.fn(() => ({})),
		getActiveGeneration: vi.fn(() => undefined),
		startGeneration: vi.fn(),
		writeChunk: vi.fn(async () => {}),
		writeChunks: vi.fn(async () => {}),
		finishGeneration: vi.fn(async () => {}),
		...overrides,
	} as unknown as AIDBSessionProtocol;
}

describe("createChunkRoutes single-writer enforcement", () => {
	it("rejects single chunk write when messageId mismatches active generation", async () => {
		const protocol = createProtocolStub({
			getActiveGeneration: vi.fn(() => "active-message"),
		});
		const app = createChunkRoutes(protocol);

		const response = await app.request("/session-1/chunks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messageId: "other-message",
				actorId: "claude",
				role: "assistant",
				chunk: { type: "text-delta", text: "hello" },
			}),
		});

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: "GENERATION_MISMATCH",
			sessionId: "session-1",
			messageId: "other-message",
			activeMessageId: "active-message",
		});
		expect(protocol.startGeneration).not.toHaveBeenCalled();
		expect(protocol.writeChunk).not.toHaveBeenCalled();
	});

	it("rejects batch writes with mixed messageIds", async () => {
		const protocol = createProtocolStub();
		const app = createChunkRoutes(protocol);

		const response = await app.request("/session-2/chunks/batch", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chunks: [
					{
						messageId: "message-a",
						actorId: "claude",
						role: "assistant",
						chunk: { type: "text-delta", text: "a" },
					},
					{
						messageId: "message-b",
						actorId: "claude",
						role: "assistant",
						chunk: { type: "text-delta", text: "b" },
					},
				],
			}),
		});

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: "GENERATION_MISMATCH",
			sessionId: "session-2",
			messageId: "message-b",
			activeMessageId: "message-a",
		});
		expect(protocol.startGeneration).not.toHaveBeenCalled();
		expect(protocol.writeChunks).not.toHaveBeenCalled();
	});

	it("rejects batch writes when active generation differs from batch messageId", async () => {
		const protocol = createProtocolStub({
			getActiveGeneration: vi.fn(() => "active-message"),
		});
		const app = createChunkRoutes(protocol);

		const response = await app.request("/session-3/chunks/batch", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chunks: [
					{
						messageId: "batch-message",
						actorId: "claude",
						role: "assistant",
						chunk: { type: "text-delta", text: "a" },
					},
					{
						messageId: "batch-message",
						actorId: "claude",
						role: "assistant",
						chunk: { type: "text-delta", text: "b" },
					},
				],
			}),
		});

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: "GENERATION_MISMATCH",
			sessionId: "session-3",
			messageId: "batch-message",
			activeMessageId: "active-message",
		});
		expect(protocol.startGeneration).not.toHaveBeenCalled();
		expect(protocol.writeChunks).not.toHaveBeenCalled();
	});
});
