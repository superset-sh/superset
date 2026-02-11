import { Hono } from "hono";
import { handleSendMessage } from "../handlers/send-message";
import type { AIDBSessionProtocol } from "../protocol";
import { stopGenerationRequestSchema } from "../types";

export function createMessageRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	app.post("/:sessionId/messages", async (c) => {
		return handleSendMessage(c, protocol);
	});

	app.post("/:sessionId/stop", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			const rawBody = await c.req.json();
			const body = stopGenerationRequestSchema.parse(rawBody);

			await protocol.stopGeneration(sessionId, body.messageId ?? null);

			return new Response(null, { status: 204 });
		} catch (error) {
			console.error("Failed to stop generation:", error);
			return c.json(
				{
					error: "Failed to stop generation",
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	return app;
}
