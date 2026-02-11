import { Hono } from "hono";
import { z } from "zod";
import type { AIDBSessionProtocol } from "../protocol";

const chunkBodySchema = z.object({
	messageId: z.string(),
	actorId: z.string(),
	role: z.enum(["user", "assistant", "system"]),
	chunk: z.record(z.string(), z.unknown()),
	txid: z.string().optional(),
});

const finishBodySchema = z.object({
	messageId: z.string().optional(),
});

export function createChunkRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	app.post("/:id/chunks", async (c) => {
		const sessionId = c.req.param("id");

		let body: z.infer<typeof chunkBodySchema>;
		try {
			const rawBody = await c.req.json();
			body = chunkBodySchema.parse(rawBody);
		} catch (error) {
			return c.json(
				{
					error: "Invalid request body",
					code: "INVALID_BODY",
					details: (error as Error).message,
				},
				400,
			);
		}

		const { messageId, actorId, role, chunk, txid } = body;

		try {
			const stream = await protocol.getOrCreateSession(sessionId);

			if (!protocol.getActiveGeneration(sessionId)) {
				protocol.startGeneration({ sessionId, messageId });
			}

			await protocol.writeChunk(
				stream,
				sessionId,
				messageId,
				actorId,
				role,
				chunk as never,
				txid,
			);

			return c.json({ ok: true, sessionId, messageId }, 200);
		} catch (error) {
			console.error("[chunks] Failed to write chunk:", error);
			return c.json(
				{
					error: "Failed to write chunk",
					code: "WRITE_FAILED",
					sessionId,
					messageId,
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	// Batch endpoint skips Zod for hot-path performance — this is an
	// authenticated internal path from the desktop client.
	app.post("/:id/chunks/batch", async (c) => {
		const sessionId = c.req.param("id");

		let chunks: Array<z.infer<typeof chunkBodySchema>>;
		try {
			const rawBody = await c.req.json();
			chunks = rawBody?.chunks;
			if (!Array.isArray(chunks) || chunks.length === 0) {
				return c.json(
					{
						error: "chunks must be a non-empty array",
						code: "INVALID_BODY",
						sessionId,
					},
					400,
				);
			}
		} catch (error) {
			return c.json(
				{
					error: "Invalid request body",
					code: "INVALID_BODY",
					sessionId,
					details: (error as Error).message,
				},
				400,
			);
		}

		try {
			await protocol.getOrCreateSession(sessionId);

			const firstMessageId = chunks[0]?.messageId;
			if (firstMessageId && !protocol.getActiveGeneration(sessionId)) {
				protocol.startGeneration({ sessionId, messageId: firstMessageId });
			}

			await protocol.writeChunks({
				sessionId,
				chunks: chunks as never,
			});

			return c.json({ ok: true, sessionId, count: chunks.length }, 200);
		} catch (error) {
			console.error("[chunks] Failed to write batch:", error);
			return c.json(
				{
					error: "Failed to write chunk batch",
					code: "WRITE_FAILED",
					sessionId,
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	app.post("/:id/generations/finish", async (c) => {
		const sessionId = c.req.param("id");

		let messageId: string | undefined;
		try {
			const rawBody = await c.req.json();
			const parsed = finishBodySchema.parse(rawBody);
			messageId = parsed.messageId;
		} catch {
			// No body or invalid JSON — messageId is optional
		}

		try {
			await protocol.getOrCreateSession(sessionId);
			await protocol.finishGeneration({ sessionId, messageId });
			return c.json({ ok: true, sessionId, messageId }, 200);
		} catch (error) {
			console.error(
				"[chunks] Generation finish failed:",
				(error as Error).message,
			);
			return c.json(
				{
					ok: false,
					error: "Generation finish failed",
					code: "FINISH_FAILED",
					sessionId,
					messageId,
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	return app;
}
