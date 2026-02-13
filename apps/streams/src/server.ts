import { db } from "@superset/db";
import { sessions } from "@superset/db/schema/auth";
import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { AIDBSessionProtocol } from "./protocol";
import {
	createApprovalRoutes,
	createAuthRoutes,
	createChunkRoutes,
	createForkRoutes,
	createHealthRoutes,
	createMessageRoutes,
	createSessionRoutes,
	createStreamRoutes,
	createToolResultRoutes,
	PROTOCOL_RESPONSE_HEADERS,
} from "./routes";
import type { AIDBProtocolOptions } from "./types";

type SessionEnv = {
	Variables: {
		userId: string;
	};
};

export interface AIDBProxyServerOptions extends AIDBProtocolOptions {
	cors?: boolean;
	logging?: boolean;
	corsOrigins?: string | string[];
}

export function createServer(options: AIDBProxyServerOptions) {
	const app = new Hono<SessionEnv>();

	const protocol = new AIDBSessionProtocol({
		baseUrl: options.baseUrl,
		storage: options.storage,
	});

	if (options.cors !== false) {
		const allowedOrigins = options.corsOrigins
			? Array.isArray(options.corsOrigins)
				? options.corsOrigins
				: [options.corsOrigins]
			: null;

		app.use(
			"*",
			cors({
				// When allowedOrigins is configured, use a function that also permits
				// null origins (Electron file://, non-browser clients).
				// Auth is enforced via Bearer tokens, not cookies, so this is safe.
				origin: allowedOrigins
					? (origin) => {
							if (!origin || origin === "null") return origin ?? "*";
							return allowedOrigins.includes(origin) ? origin : "";
						}
					: "*",
				allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
				allowHeaders: [
					"Content-Type",
					"Authorization",
					"X-Actor-Id",
					"X-Actor-Type",
					"X-Session-Id",
				],
				exposeHeaders: [...PROTOCOL_RESPONSE_HEADERS],
			}),
		);
	}

	if (options.logging !== false) {
		app.use("*", logger());
	}

	app.route("/health", createHealthRoutes());

	// No auth on health; Bearer token required on /v1/*
	app.use("/v1/*", async (c, next) => {
		const authorization = c.req.header("Authorization");
		if (!authorization?.startsWith("Bearer ")) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const token = authorization.slice(7);
		const [session] = await db
			.select({ userId: sessions.userId })
			.from(sessions)
			.where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
			.limit(1);

		if (!session) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		c.set("userId", session.userId);
		return next();
	});

	const v1 = new Hono();
	v1.route("/sessions", createSessionRoutes(protocol));
	v1.route("/sessions", createAuthRoutes(protocol));
	v1.route("/sessions", createMessageRoutes(protocol));
	v1.route("/sessions", createToolResultRoutes(protocol));
	v1.route("/sessions", createApprovalRoutes(protocol));
	v1.route("/sessions", createForkRoutes(protocol));
	v1.route("/sessions", createChunkRoutes(protocol));
	v1.route("/stream", createStreamRoutes(options.baseUrl));

	app.route("/v1", v1);

	app.get("/", (c) => {
		return c.json({
			name: "@superset/streams",
			version: "0.1.0",
			endpoints: {
				health: "/health",
				stream: "/v1/stream/sessions/:sessionId",
				sessions: "/v1/sessions/:sessionId",
				messages: "/v1/sessions/:sessionId/messages",
				toolResults: "/v1/sessions/:sessionId/tool-results",
				approvals: "/v1/sessions/:sessionId/approvals/:approvalId",
				chunks: "/v1/sessions/:sessionId/chunks",
				chunksBatch: "/v1/sessions/:sessionId/chunks/batch",
				generationsFinish: "/v1/sessions/:sessionId/generations/finish",
				fork: "/v1/sessions/:sessionId/fork",
				stop: "/v1/sessions/:sessionId/stop",
				reset: "/v1/sessions/:sessionId/reset",
			},
		});
	});

	return { app, protocol };
}

export default createServer;
