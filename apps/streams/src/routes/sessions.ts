import { Hono } from "hono";
import type { AIDBSessionProtocol } from "../protocol";

export function createSessionRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	app.put("/:sessionId", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			const _stream = await protocol.getOrCreateSession(sessionId);

			return c.json(
				{
					sessionId,
					streamUrl: `/v1/stream/sessions/${sessionId}`,
				},
				200,
			);
		} catch (error) {
			console.error("Failed to create session:", error);
			return c.json(
				{
					error: "Failed to create session",
					code: "CREATE_FAILED",
					sessionId,
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	app.get("/:sessionId", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			const stream = await protocol.getSession(sessionId);

			if (!stream) {
				return c.json(
					{ error: "Session not found", code: "SESSION_NOT_FOUND", sessionId },
					404,
				);
			}

			return c.json({
				sessionId,
				streamUrl: `/v1/stream/sessions/${sessionId}`,
			});
		} catch (error) {
			console.error("Failed to get session:", error);
			return c.json(
				{
					error: "Failed to get session",
					code: "GET_FAILED",
					sessionId,
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	app.delete("/:sessionId", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			await protocol.deleteSession(sessionId);
			return new Response(null, { status: 204 });
		} catch (error) {
			console.error("Failed to delete session:", error);
			return c.json(
				{
					error: "Failed to delete session",
					code: "DELETE_FAILED",
					sessionId,
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	app.post("/:sessionId/reset", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			let clearPresence = false;
			try {
				const body = await c.req.json();
				clearPresence = body?.clearPresence === true;
			} catch {
				// No body or invalid JSON - use defaults
			}

			await protocol.resetSession(sessionId, clearPresence);

			return c.json({
				success: true,
				sessionId,
				message: "Session reset. All connected clients will clear their state.",
			});
		} catch (error) {
			console.error("Failed to reset session:", error);

			if ((error as Error).message.includes("not found")) {
				return c.json(
					{ error: "Session not found", code: "SESSION_NOT_FOUND", sessionId },
					404,
				);
			}

			return c.json(
				{
					error: "Failed to reset session",
					code: "RESET_FAILED",
					sessionId,
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	return app;
}
