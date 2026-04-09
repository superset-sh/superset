import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { checkHostAccess } from "./access";
import { type AuthContext, verifyJWT } from "./auth";
import { env } from "./env";
import { TunnelManager } from "./tunnel";

type AppContext = {
	Variables: {
		auth: AuthContext;
		token: string;
		hostId: string;
	};
};

const app = new Hono<AppContext>();
const tunnelManager = new TunnelManager();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

// ── Auth ────────────────────────────────────────────────────────────

function extractToken(c: {
	req: {
		header(name: string): string | undefined;
		query(name: string): string | undefined;
	};
}): string | null {
	const header = c.req.header("Authorization");
	if (header?.startsWith("Bearer ")) return header.slice(7);
	return c.req.query("token") ?? null;
}

const authMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
	const token = extractToken(c);
	if (!token) return c.json({ error: "Unauthorized" }, 401);

	const auth = await verifyJWT(token, env.NEXT_PUBLIC_API_URL);
	if (!auth) return c.json({ error: "Unauthorized" }, 401);

	const hostId = c.req.param("hostId");
	if (!hostId) return c.json({ error: "Missing hostId" }, 400);

	const hasAccess = await checkHostAccess(token, hostId);
	if (!hasAccess) return c.json({ error: "Forbidden" }, 403);

	if (!tunnelManager.hasTunnel(hostId))
		return c.json({ error: "Host not connected" }, 503);

	c.set("auth", auth);
	c.set("token", token);
	c.set("hostId", hostId);
	return next();
};

// ── Tunnel ──────────────────────────────────────────────────────────

app.get(
	"/tunnel",
	upgradeWebSocket((c) => {
		const hostId = c.req.query("hostId");
		const token = extractToken(c);
		let authorized = false;

		return {
			onOpen: async (_event, ws) => {
				if (!hostId || !token) {
					ws.close(1008, "Missing hostId or token");
					return;
				}

				const auth = await verifyJWT(token, env.NEXT_PUBLIC_API_URL);
				if (!auth) {
					ws.close(1008, "Unauthorized");
					return;
				}

				const hasAccess = await checkHostAccess(token, hostId);
				if (!hasAccess) {
					ws.close(1008, "Forbidden");
					return;
				}

				tunnelManager.register(hostId, token, ws);
				authorized = true;
			},
			onMessage: (event) => {
				if (authorized && hostId)
					tunnelManager.handleMessage(hostId, event.data);
			},
			onClose: () => {
				if (authorized && hostId) tunnelManager.unregister(hostId);
			},
			onError: () => {
				if (authorized && hostId) tunnelManager.unregister(hostId);
			},
		};
	}),
);

// ── Host proxy (auth required) ──────────────────────────────────────

app.use("/hosts/:hostId/*", authMiddleware);

app.all("/hosts/:hostId/trpc/*", async (c) => {
	const hostId = c.get("hostId");
	const prefix = `/hosts/${hostId}`;
	const url = new URL(c.req.url);
	const path = `${url.pathname.slice(prefix.length) || "/"}${url.search}`;
	const body = (await c.req.text().catch(() => "")) || undefined;

	const headers: Record<string, string> = {};
	for (const [key, value] of c.req.raw.headers.entries()) {
		if (key !== "host" && key !== "authorization") headers[key] = value;
	}

	try {
		const res = await tunnelManager.sendHttpRequest(hostId, {
			method: c.req.method,
			path,
			headers,
			body,
		});
		return new Response(res.body ?? null, {
			status: res.status,
			headers: res.headers,
		});
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Proxy error" },
			502,
		);
	}
});

app.get(
	"/hosts/:hostId/*",
	upgradeWebSocket((c) => {
		const url = new URL(c.req.url);
		const hostId = url.pathname.split("/")[2] ?? "";
		const prefix = `/hosts/${hostId}`;
		const path = url.pathname.slice(prefix.length) || "/";
		const query = url.search.slice(1) || undefined;
		let channelId: string | null = null;

		return {
			onOpen: (_event, ws) => {
				try {
					channelId = tunnelManager.openWsChannel(hostId, path, query, ws);
				} catch {
					ws.close(1011, "Failed to open channel");
				}
			},
			onMessage: (event) => {
				if (channelId)
					tunnelManager.sendWsFrame(hostId, channelId, String(event.data));
			},
			onClose: () => {
				if (channelId) tunnelManager.closeWsChannel(hostId, channelId);
			},
			onError: () => {
				if (channelId) tunnelManager.closeWsChannel(hostId, channelId);
			},
		};
	}),
);

// ── Start ───────────────────────────────────────────────────────────

const server = serve({ fetch: app.fetch, port: env.RELAY_PORT }, (info) => {
	console.log(`[relay] listening on http://localhost:${info.port}`);
});
injectWebSocket(server);
