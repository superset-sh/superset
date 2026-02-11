import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AIDBSessionProtocol } from "../protocol";
import type { StreamChunk } from "../types";

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

type ChunkBody = z.infer<typeof chunkBodySchema>;
type PersistableChunk = {
	messageId: string;
	actorId: string;
	role: ChunkBody["role"];
	chunk: StreamChunk;
	txid?: string;
};

const VALID_ROLES = new Set<ChunkBody["role"]>(["user", "assistant", "system"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStreamChunk(value: unknown): value is StreamChunk {
	return isRecord(value) && typeof value.type === "string";
}

export function createChunkRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	const generationMismatchResponse = ({
		c,
		sessionId,
		messageId,
		activeMessageId,
	}: {
		c: Context;
		sessionId: string;
		messageId: string;
		activeMessageId: string;
	}) =>
		c.json(
			{
				error: "Generation mismatch",
				code: "GENERATION_MISMATCH",
				sessionId,
				messageId,
				activeMessageId,
			},
			409,
		);

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
			const stream = protocol.getSession(sessionId);
			if (!stream) {
				return c.json(
					{
						error: "Session not found",
						code: "SESSION_NOT_FOUND",
						sessionId,
						messageId,
					},
					404,
				);
			}

			const activeMessageId = protocol.getActiveGeneration(sessionId);
			if (!activeMessageId) {
				protocol.startGeneration({ sessionId, messageId });
			} else if (activeMessageId !== messageId) {
				return generationMismatchResponse({
					c,
					sessionId,
					messageId,
					activeMessageId,
				});
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

		let chunks: PersistableChunk[];
		try {
			const rawBody = await c.req.json();
			const rawChunks = rawBody?.chunks;
			if (!Array.isArray(rawChunks) || rawChunks.length === 0) {
				return c.json(
					{
						error: "chunks must be a non-empty array",
						code: "INVALID_BODY",
						sessionId,
					},
					400,
				);
			}

			const validatedChunks: PersistableChunk[] = [];
			for (const rawChunk of rawChunks) {
				if (!isRecord(rawChunk)) {
					return c.json(
						{
							error: "Each chunk must be an object",
							code: "INVALID_BODY",
							sessionId,
						},
						400,
					);
				}

				const { messageId, actorId, role, chunk, txid } = rawChunk;
				if (typeof messageId !== "string" || typeof actorId !== "string") {
					return c.json(
						{
							error: "Each chunk must include string messageId and actorId",
							code: "INVALID_BODY",
							sessionId,
						},
						400,
					);
				}
				if (
					typeof role !== "string" ||
					!VALID_ROLES.has(role as ChunkBody["role"])
				) {
					return c.json(
						{
							error: "Each chunk must include a valid role",
							code: "INVALID_BODY",
							sessionId,
						},
						400,
					);
				}
				if (!isStreamChunk(chunk)) {
					return c.json(
						{
							error: "Each chunk must include a chunk payload with string type",
							code: "INVALID_BODY",
							sessionId,
						},
						400,
					);
				}
				if (txid !== undefined && typeof txid !== "string") {
					return c.json(
						{
							error: "txid must be a string when provided",
							code: "INVALID_BODY",
							sessionId,
						},
						400,
					);
				}

				validatedChunks.push({
					messageId,
					actorId,
					role: role as ChunkBody["role"],
					chunk,
					...(txid !== undefined ? { txid } : {}),
				});
			}
			chunks = validatedChunks;
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
			if (!protocol.getSession(sessionId)) {
				return c.json(
					{
						error: "Session not found",
						code: "SESSION_NOT_FOUND",
						sessionId,
					},
					404,
				);
			}

			const firstMessageId = chunks[0]?.messageId;
			if (!firstMessageId) {
				return c.json(
					{
						error: "Each chunk must include messageId",
						code: "INVALID_BODY",
						sessionId,
					},
					400,
				);
			}

			const mixedMessageIdChunk = chunks.find(
				(chunk) => chunk.messageId !== firstMessageId,
			);
			if (mixedMessageIdChunk) {
				return c.json(
					{
						error: "Batch chunks must belong to one generation",
						code: "GENERATION_MISMATCH",
						sessionId,
						messageId: mixedMessageIdChunk.messageId,
						activeMessageId: firstMessageId,
					},
					409,
				);
			}

			const activeMessageId = protocol.getActiveGeneration(sessionId);
			if (!activeMessageId) {
				protocol.startGeneration({ sessionId, messageId: firstMessageId });
			} else if (activeMessageId !== firstMessageId) {
				return generationMismatchResponse({
					c,
					sessionId,
					messageId: firstMessageId,
					activeMessageId,
				});
			}

			await protocol.writeChunks({
				sessionId,
				chunks,
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
			if (!protocol.getSession(sessionId)) {
				return c.json(
					{
						ok: false,
						error: "Session not found",
						code: "SESSION_NOT_FOUND",
						sessionId,
						messageId,
					},
					404,
				);
			}
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
