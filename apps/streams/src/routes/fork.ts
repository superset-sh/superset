import { Hono } from "hono";
import type { AIDBSessionProtocol } from "../protocol";
import { type ForkSessionResponse, forkSessionRequestSchema } from "../types";

export function createForkRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	app.post("/:sessionId/fork", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			const rawBody = await c.req.json();
			const body = forkSessionRequestSchema.parse(rawBody);

			const result = await protocol.forkSession(
				sessionId,
				body.atMessageId ?? null,
				body.newSessionId ?? null,
			);

			const response: ForkSessionResponse = {
				sessionId: result.sessionId,
				offset: result.offset,
			};

			return c.json(response, 201);
		} catch (error) {
			console.error("Failed to fork session:", error);
			return c.json(
				{ error: "Failed to fork session", details: (error as Error).message },
				500,
			);
		}
	});

	return app;
}
