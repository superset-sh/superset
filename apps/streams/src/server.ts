import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env";

/** Hop-by-hop headers that should NOT be forwarded through a proxy. */
const HOP_BY_HOP = new Set([
	"connection",
	"keep-alive",
	"transfer-encoding",
	"te",
	"trailer",
	"upgrade",
	"host",
]);

export function createServer(options: {
	baseUrl: string;
	corsOrigins?: string[];
}) {
	const app = new Hono();

	const allowedOrigins = options.corsOrigins ?? null;

	app.use(
		"*",
		cors({
			origin: allowedOrigins
				? (origin) => {
						if (!origin || origin === "null") return origin ?? "*";
						return allowedOrigins.includes(origin) ? origin : "";
					}
				: "*",
			allowMethods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
			allowHeaders: ["*"],
			exposeHeaders: ["*"],
		}),
	);

	app.use("*", logger());

	app.get("/health", (c) => c.json({ status: "ok" }));

	if (env.STREAMS_AUTH_TOKEN) {
		const token = env.STREAMS_AUTH_TOKEN;
		app.use("/v1/*", async (c, next) => {
			const authorization = c.req.header("Authorization");
			if (!authorization?.startsWith("Bearer ")) {
				return c.json({ error: "Unauthorized" }, 401);
			}
			if (authorization.slice(7) !== token) {
				return c.json({ error: "Unauthorized" }, 401);
			}
			return next();
		});
	}

	// Transparent proxy — forward all methods to the internal durable stream server
	app.all("/v1/stream/sessions/:sessionId", async (c) => {
		const sessionId = c.req.param("sessionId");
		const upstream = new URL(
			`${options.baseUrl}/v1/stream/sessions/${sessionId}`,
		);

		// Forward query params
		for (const [key, value] of Object.entries(c.req.query())) {
			if (value !== undefined) upstream.searchParams.set(key, value);
		}

		// Forward all non-hop-by-hop headers
		const headers: Record<string, string> = {};
		for (const [key, value] of c.req.raw.headers.entries()) {
			if (!HOP_BY_HOP.has(key.toLowerCase())) {
				headers[key] = value;
			}
		}

		const method = c.req.method;
		const hasBody = method === "POST" || method === "PUT";
		const init: RequestInit = { method, headers };
		if (hasBody) {
			init.body = c.req.raw.body;
			(init as Record<string, unknown>).duplex = "half";
		}

		try {
			const res = await fetch(upstream.toString(), init);

			// Forward all response headers
			for (const [key, value] of res.headers.entries()) {
				if (!HOP_BY_HOP.has(key.toLowerCase())) {
					c.header(key, value);
				}
			}

			if (res.status === 204 || !res.body) {
				return c.body(null, res.status as 204);
			}

			c.status(res.status as 200);
			return c.body(res.body as ReadableStream);
		} catch (error) {
			console.error(`[stream] ${method} proxy error:`, error);
			return c.json(
				{
					error: "Failed to proxy request",
					details: (error as Error).message,
				},
				502,
			);
		}
	});

	app.get("/", (c) =>
		c.json({
			name: "@superset/streams",
			version: "0.1.0",
		}),
	);

	return { app };
}
