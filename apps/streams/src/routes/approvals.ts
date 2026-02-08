import { Hono } from "hono";
import { z } from "zod";
import {
	type ForwardResult,
	forwardToAgent,
} from "../handlers/forward-to-agent";
import type { AIDBSessionProtocol } from "../protocol";
import { approvalResponseRequestSchema } from "../types";

const answerRequestSchema = z.object({
	answers: z.record(z.string(), z.string()),
	originalInput: z.record(z.string(), z.unknown()).optional(),
});

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
			let forwarded = false;
			let lastResult: ForwardResult | null = null;
			for (const agent of agents) {
				const result = await forwardToAgent({
					agentEndpoint: agent.endpoint,
					path: `approvals/${approvalId}`,
					body: { approved: body.approved },
				});
				lastResult = result;
				if (result.ok) {
					forwarded = true;
				}
			}

			// 404 = agent has no pending permission (already processed or session ended).
			// The approval was persisted to the durable stream, so the client state is correct.
			if (agents.length > 0 && !forwarded) {
				const isStale =
					lastResult && !lastResult.ok && lastResult.status === 404;
				if (isStale) {
					console.warn(
						`[approvals] Agent returned 404 for ${approvalId} — approval persisted but agent has no pending permission`,
					);
					return new Response(null, { status: 204 });
				}

				return c.json(
					{ error: "Approval persisted but failed to forward to agent" },
					502,
				);
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
			const rawBody = await c.req.json();
			const parsed = answerRequestSchema.safeParse(rawBody);
			if (!parsed.success) {
				return c.json(
					{ error: "Invalid request body", details: parsed.error.message },
					400,
				);
			}
			const body = parsed.data;

			const agents = protocol.getRegisteredAgents(sessionId);
			let forwarded = false;
			let lastResult: ForwardResult | null = null;
			for (const agent of agents) {
				const result = await forwardToAgent({
					agentEndpoint: agent.endpoint,
					path: `answers/${toolUseId}`,
					body,
				});
				lastResult = result;
				if (result.ok) {
					forwarded = true;
				}
			}

			if (agents.length > 0 && !forwarded) {
				const isStale =
					lastResult && !lastResult.ok && lastResult.status === 404;
				if (isStale) {
					console.warn(
						`[answers] Agent returned 404 for ${toolUseId} — agent has no pending question`,
					);
					return new Response(null, { status: 204 });
				}

				return c.json({ error: "Failed to forward answer to agent" }, 502);
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
