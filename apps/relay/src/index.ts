import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { checkHostAccess } from "./access";
import { type AuthContext, verifyJWT } from "./auth";
import * as directory from "./directory";
import { env } from "./env";
import { captureSentryException, initSentry } from "./sentry";
import { startSyntheticCheck } from "./synthetic";
import { TunnelManager } from "./tunnel";

initSentry();

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

app.get("/health", (c) => c.json({ ok: true, region: env.FLY_REGION }));

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

async function maybeReplay(hostId: string): Promise<{
	header: Record<string, string>;
	kind: "instance" | "region";
} | null> {
	if (tunnelManager.hasTunnel(hostId)) return null;
	const owner = await directory.lookup(hostId).catch((err) => {
		captureSentryException(err, { op: "directory.lookup", hostId });
		return null;
	});
	if (!owner) return null;
	// Guard against directory thinking we own a tunnel we don't have locally
	// (sweep race window, or a register write that hasn't landed yet). Without
	// this, fly would replay the request right back to us → infinite loop.
	if (
		owner.region === env.FLY_REGION &&
		owner.machineId === env.FLY_MACHINE_ID
	) {
		return null;
	}
	if (owner.region === env.FLY_REGION) {
		return {
			header: { "fly-replay": `instance=${owner.machineId}` },
			kind: "instance",
		};
	}
	return {
		header: { "fly-replay": `region=${owner.region}` },
		kind: "region",
	};
}

const authMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
	const token = extractToken(c);
	if (!token) return c.json({ error: "Unauthorized" }, 401);

	const auth = await verifyJWT(token, env.NEXT_PUBLIC_API_URL);
	if (!auth) return c.json({ error: "Unauthorized" }, 401);

	const hostId = c.req.param("hostId");
	if (!hostId) return c.json({ error: "Missing hostId" }, 400);

	// Replay BEFORE the access check: if this machine doesn't own the
	// tunnel, the destination machine will authorize the request — no need
	// to double-bill the API for checkHostAccess on every cross-machine hop.
	if (!tunnelManager.hasTunnel(hostId)) {
		const replay = await maybeReplay(hostId);
		if (replay) return c.body(null, 200, replay.header);
		return c.json({ error: "Host not connected" }, 503);
	}

	const hasAccess = await checkHostAccess(token, hostId);
	if (!hasAccess) return c.json({ error: "Forbidden" }, 403);

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
		let registeredWs: Parameters<typeof tunnelManager.register>[2] | null =
			null;

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

				await tunnelManager.register(hostId, token, ws);
				// register closes ws itself on directory failure; only mark
				// authorized if the socket is still usable.
				if (ws.readyState === 1) registeredWs = ws;
			},
			onMessage: (event) => {
				if (registeredWs && hostId)
					tunnelManager.handleMessage(hostId, event.data);
			},
			onClose: () => {
				if (registeredWs && hostId)
					tunnelManager.unregister(hostId, registeredWs);
			},
			onError: () => {
				if (registeredWs && hostId)
					tunnelManager.unregister(hostId, registeredWs);
			},
		};
	}),
);

// ── Pre-flight for WS replay (host hits this once before opening WS to a host) ─

// Pre-flight for WS upgrade routing. Requires a valid JWT (no checkHostAccess —
// the destination machine still authorizes) so we don't leak tunnel-presence
// or fly topology to unauthenticated probers.
app.get("/hosts/:hostId/_whoowns", async (c) => {
	const token = extractToken(c);
	if (!token) return c.json({ error: "Unauthorized" }, 401);
	const auth = await verifyJWT(token, env.NEXT_PUBLIC_API_URL);
	if (!auth) return c.json({ error: "Unauthorized" }, 401);

	const hostId = c.req.param("hostId");
	const replay = await maybeReplay(hostId);
	if (!replay) {
		return tunnelManager.hasTunnel(hostId)
			? c.json({ ok: true, region: env.FLY_REGION })
			: c.json({ error: "Host not connected" }, 503);
	}
	return c.body(null, 200, replay.header);
});

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
		captureSentryException(error, { hostId, path });
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

// ── Periodic directory sweeper ──────────────────────────────────────

setInterval(() => {
	void directory.sweepStale().catch((err) => {
		captureSentryException(err, { op: "directory.sweepStale" });
	});
}, 30_000);

// ── Synthetic check ─────────────────────────────────────────────────

if (env.RELAY_SYNTHETIC_JWT) {
	startSyntheticCheck({
		relayUrl: env.RELAY_PUBLIC_URL,
		jwt: env.RELAY_SYNTHETIC_JWT,
		region: env.FLY_REGION,
		machineId: env.FLY_MACHINE_ID,
	});
}

// ── Start ───────────────────────────────────────────────────────────

const server = serve({ fetch: app.fetch, port: env.RELAY_PORT }, (info) => {
	console.log(
		`[relay] listening on http://localhost:${info.port} (region=${env.FLY_REGION} machine=${env.FLY_MACHINE_ID})`,
	);
});
injectWebSocket(server);
