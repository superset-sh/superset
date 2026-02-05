import { Hono } from "hono";
import type { AIDBSessionProtocol } from "../protocol";
import { toolResultRequestSchema } from "../types";

export function createToolResultRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	app.post("/:sessionId/tool-results", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			const rawBody = await c.req.json();
			const body = toolResultRequestSchema.parse(rawBody);

			const actorId = c.req.header("X-Actor-Id") ?? crypto.randomUUID();
			const messageId = body.messageId ?? crypto.randomUUID();

			const stream = await protocol.getOrCreateSession(sessionId);

			await protocol.writeToolResult(
				stream,
				sessionId,
				messageId,
				actorId,
				body.toolCallId,
				body.output,
				body.error ?? null,
				body.txid,
			);

			return new Response(null, { status: 204 });
		} catch (error) {
			console.error("Failed to add tool result:", error);
			return c.json(
				{
					error: "Failed to add tool result",
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	return app;
}
