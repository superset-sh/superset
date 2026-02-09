/**
 * AI DB Proxy Server
 *
 * Hono-based HTTP server implementing the AI DB Wrapper Protocol.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { AIDBSessionProtocol } from "./protocol";
import {
	createAgentRoutes,
	createApprovalRoutes,
	createAuthRoutes,
	createForkRoutes,
	createHealthRoutes,
	createMessageRoutes,
	createSessionRoutes,
	createStreamRoutes,
	createToolResultRoutes,
	PROTOCOL_RESPONSE_HEADERS,
} from "./routes";
import type { AIDBProtocolOptions } from "./types";

export interface AIDBProxyServerOptions extends AIDBProtocolOptions {
	/** Enable CORS */
	cors?: boolean;
	/** Enable request logging */
	logging?: boolean;
	/** Custom CORS origins */
	corsOrigins?: string | string[];
	/** If set, require Bearer token on /v1/* routes */
	authToken?: string;
}

export function createServer(options: AIDBProxyServerOptions) {
	const app = new Hono();

	// Create protocol instance
	const protocol = new AIDBSessionProtocol({
		baseUrl: options.baseUrl,
		storage: options.storage,
	});

	// Middleware
	if (options.cors !== false) {
		app.use(
			"*",
			cors({
				origin: options.corsOrigins ?? "*",
				allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
				allowHeaders: [
					"Content-Type",
					"Authorization",
					"X-Actor-Id",
					"X-Actor-Type",
					"X-Session-Id",
				],
				// Expose Durable Streams protocol headers to browser clients
				exposeHeaders: [...PROTOCOL_RESPONSE_HEADERS],
			}),
		);
	}

	if (options.logging !== false) {
		app.use("*", logger());
	}

	// Health routes (no auth)
	app.route("/health", createHealthRoutes());

	// Auth middleware on /v1/* routes
	if (options.authToken) {
		const expectedHeader = `Bearer ${options.authToken}`;
		app.use("/v1/*", async (c, next) => {
			const authorization = c.req.header("Authorization");
			if (authorization !== expectedHeader) {
				return c.json({ error: "Unauthorized" }, 401);
			}
			return next();
		});
	}

	// API v1 routes
	const v1 = new Hono();

	// Session management
	v1.route("/sessions", createSessionRoutes(protocol));

	// Auth (login/logout - nested under sessions)
	v1.route("/sessions", createAuthRoutes(protocol));

	// Messages (nested under sessions)
	v1.route("/sessions", createMessageRoutes(protocol));

	// Agents (nested under sessions)
	v1.route("/sessions", createAgentRoutes(protocol));

	// Tool results (nested under sessions)
	v1.route("/sessions", createToolResultRoutes(protocol));

	// Approvals (nested under sessions)
	v1.route("/sessions", createApprovalRoutes(protocol));

	// Fork (nested under sessions)
	v1.route("/sessions", createForkRoutes(protocol));

	// Stream proxy - forwards to Durable Streams server
	v1.route("/stream", createStreamRoutes(options.baseUrl));

	app.route("/v1", v1);

	// Root info
	app.get("/", (c) => {
		return c.json({
			name: "@superset/streams",
			version: "0.1.0",
			endpoints: {
				health: "/health",
				stream: "/v1/stream/sessions/:sessionId",
				sessions: "/v1/sessions/:sessionId",
				messages: "/v1/sessions/:sessionId/messages",
				agents: "/v1/sessions/:sessionId/agents",
				toolResults: "/v1/sessions/:sessionId/tool-results",
				approvals: "/v1/sessions/:sessionId/approvals/:approvalId",
				fork: "/v1/sessions/:sessionId/fork",
				stop: "/v1/sessions/:sessionId/stop",
				regenerate: "/v1/sessions/:sessionId/regenerate",
				reset: "/v1/sessions/:sessionId/reset",
			},
		});
	});

	return { app, protocol };
}

export default createServer;
