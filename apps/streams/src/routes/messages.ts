import { Hono } from "hono";
import { handleSendMessage } from "../handlers/send-message";
import type { AIDBSessionProtocol } from "../protocol";
import { regenerateRequestSchema, stopGenerationRequestSchema } from "../types";

export function createMessageRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	app.post("/:sessionId/messages", async (c) => {
		return handleSendMessage(c, protocol);
	});

	app.post("/:sessionId/regenerate", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			const rawBody = await c.req.json();
			const body = regenerateRequestSchema.parse(rawBody);

			const _actorId =
				body.actorId ?? c.req.header("X-Actor-Id") ?? crypto.randomUUID();

			const stream = await protocol.getOrCreateSession(sessionId);

			const agents = await protocol.getRegisteredAgents(sessionId);

			if (agents.length === 0) {
				return c.json({ error: "No agents registered for regeneration" }, 400);
			}

			const messageHistory = [
				{
					role: "user",
					content: body.content,
				},
			];

			const agent = agents[0];
			if (!agent) {
				return c.json({ error: "No agents registered for regeneration" }, 400);
			}

			await protocol.invokeAgent(stream, sessionId, agent, messageHistory);

			return c.json({ success: true }, 200);
		} catch (error) {
			console.error("Failed to regenerate:", error);
			return c.json(
				{ error: "Failed to regenerate", details: (error as Error).message },
				500,
			);
		}
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
