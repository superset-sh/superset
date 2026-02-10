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
				{ error: "Invalid request body", details: (error as Error).message },
				400,
			);
		}

		const { messageId, actorId, role, chunk, txid } = body;

		const stream = protocol.getSession(sessionId);
		if (!stream) {
			return c.json({ error: "Session not found" }, 404);
		}

		try {
			await protocol.writeChunk(
				stream,
				sessionId,
				messageId,
				actorId,
				role,
				chunk as never,
				txid,
			);

			return c.json({ ok: true }, 200);
		} catch (error) {
			console.error("[chunks] Failed to write chunk:", error);
			return c.json(
				{
					error: "Failed to write chunk",
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	app.post("/:id/generations/start", async (c) => {
		const sessionId = c.req.param("id");

		const stream = protocol.getSession(sessionId);
		if (!stream) {
			return c.json({ error: "Session not found" }, 404);
		}

		const messageId = crypto.randomUUID();

		return c.json({ messageId }, 200);
	});

	app.post("/:id/generations/finish", async (c) => {
		const sessionId = c.req.param("id");

		const stream = protocol.getSession(sessionId);
		if (!stream) {
			return c.json({ error: "Session not found" }, 404);
		}

		return c.json({ ok: true }, 200);
	});

	return app;
}
