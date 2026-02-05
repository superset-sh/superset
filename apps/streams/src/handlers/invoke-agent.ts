import type { Context } from "hono";
import { z } from "zod";
import type { AIDBSessionProtocol } from "../protocol";
import { type AgentSpec, agentSpecSchema } from "../types";

const invokeAgentRequestSchema = z.object({
	agent: agentSpecSchema,
	messages: z.array(
		z.object({
			role: z.string(),
			content: z.string(),
		}),
	),
});

type InvokeAgentRequest = z.infer<typeof invokeAgentRequestSchema>;

export async function handleInvokeAgent(
	c: Context,
	protocol: AIDBSessionProtocol,
): Promise<Response> {
	const sessionId = c.req.param("sessionId");

	let body: InvokeAgentRequest;
	try {
		const rawBody = await c.req.json();
		body = invokeAgentRequestSchema.parse(rawBody);
	} catch (error) {
		return c.json(
			{ error: "Invalid request body", details: (error as Error).message },
			400,
		);
	}

	try {
		const stream = await protocol.getOrCreateSession(sessionId);
		await protocol.invokeAgent(stream, sessionId, body.agent, body.messages);
		return c.json({ success: true }, 200);
	} catch (error) {
		console.error("Failed to invoke agent:", error);
		return c.json(
			{ error: "Failed to invoke agent", details: (error as Error).message },
			500,
		);
	}
}

export async function handleRegisterAgents(
	c: Context,
	protocol: AIDBSessionProtocol,
): Promise<Response> {
	const sessionId = c.req.param("sessionId");

	let agents: AgentSpec[];
	try {
		const rawBody = await c.req.json();
		const parsed = z
			.object({ agents: z.array(agentSpecSchema) })
			.parse(rawBody);
		agents = parsed.agents;
	} catch (error) {
		return c.json(
			{ error: "Invalid request body", details: (error as Error).message },
			400,
		);
	}

	try {
		await protocol.getOrCreateSession(sessionId);
		await protocol.registerAgents(sessionId, agents);
		return c.json({ success: true }, 200);
	} catch (error) {
		console.error("Failed to register agents:", error);
		return c.json(
			{ error: "Failed to register agents", details: (error as Error).message },
			500,
		);
	}
}

export async function handleUnregisterAgent(
	c: Context,
	protocol: AIDBSessionProtocol,
): Promise<Response> {
	const sessionId = c.req.param("sessionId");
	const agentId = c.req.param("agentId");

	try {
		await protocol.unregisterAgent(sessionId, agentId);
		return new Response(null, { status: 204 });
	} catch (error) {
		console.error("Failed to unregister agent:", error);
		return c.json(
			{
				error: "Failed to unregister agent",
				details: (error as Error).message,
			},
			500,
		);
	}
}
