import { Hono } from "hono";
import { forwardToAgent } from "../handlers/forward-to-agent";
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

			const agents = protocol.getRegisteredAgents(sessionId);
			for (const agent of agents) {
				await forwardToAgent({
					agentEndpoint: agent.endpoint,
					path: `approvals/${approvalId}`,
					body: { approved: body.approved },
				});
			}

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

	app.post("/:sessionId/answers/:toolUseId", async (c) => {
		const sessionId = c.req.param("sessionId");
		const toolUseId = c.req.param("toolUseId");

		try {
			const rawBody = (await c.req.json()) as {
				answers: Record<string, string>;
				originalInput?: Record<string, unknown>;
			};

			const agents = protocol.getRegisteredAgents(sessionId);
			for (const agent of agents) {
				await forwardToAgent({
					agentEndpoint: agent.endpoint,
					path: `answers/${toolUseId}`,
					body: rawBody,
				});
			}

			return new Response(null, { status: 204 });
		} catch (error) {
			console.error("Failed to forward answer:", error);
			return c.json(
				{
					error: "Failed to forward answer",
					details: (error as Error).message,
				},
				500,
			);
		}
	});

	return app;
}
