import { Hono } from "hono";
import {
	handleRegisterAgents,
	handleUnregisterAgent,
} from "../handlers/invoke-agent";
import type { AIDBSessionProtocol } from "../protocol";

export function createAgentRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	app.post("/:sessionId/agents", async (c) => {
		return handleRegisterAgents(c, protocol);
	});

	app.get("/:sessionId/agents", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			const agents = await protocol.getRegisteredAgents(sessionId);
			return c.json({ agents });
		} catch (error) {
			console.error("Failed to get agents:", error);
			return c.json(
				{ error: "Failed to get agents", details: (error as Error).message },
				500,
			);
		}
	});

	app.delete("/:sessionId/agents/:agentId", async (c) => {
		return handleUnregisterAgent(c, protocol);
	});

	return app;
}
