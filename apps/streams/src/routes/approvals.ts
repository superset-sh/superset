import { Hono } from "hono";
import type { AIDBSessionProtocol } from "../protocol";
import { approvalResponseRequestSchema } from "../types";

export function createApprovalRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	app.post("/:sessionId/approvals/:approvalId", async (c) => {
		const sessionId = c.req.param("sessionId");
		const approvalId = c.req.param("approvalId");

		try {
			const rawBody = await c.req.json();
			const body = approvalResponseRequestSchema.parse(rawBody);

			const actorId = c.req.header("X-Actor-Id") ?? crypto.randomUUID();

			const stream = await protocol.getOrCreateSession(sessionId);

			await protocol.writeApprovalResponse(
				stream,
				sessionId,
				actorId,
				approvalId,
				body.approved,
				body.txid,
			);

			return new Response(null, { status: 204 });
		} catch (error) {
			console.error("Failed to respond to approval:", error);
			return c.json(
				{
					error: "Failed to respond to approval",
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	return app;
}
