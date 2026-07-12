import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { accessDenialMessage, checkHostAccess } from "./access";
import { type AuthContext, verifyJWT } from "./auth";
import * as directory from "./directory";
import { env } from "./env";
import { createProxyBridge, internalProxyUrl, PROXY_HOP_PARAM } from "./proxy";
import { captureSentryException, initSentry } from "./sentry";
import { startSyntheticCheck } from "./synthetic";
import { isTrpcPath, trpcErrorResponse } from "./trpc-error";
import { TunnelManager } from "./tunnel";

// Bearer tokens we never want in stdout. Hosts put their JWT on the WS
// upgrade URL because browser WebSockets can't send custom headers, and
// Hono's default `logger()` echoes the full query string. Mask the values
// before they reach the log sink so the raw token doesn't end up in Fly
// logs / Sentry breadcrumbs.
const SENSITIVE_QUERY_RE = /([?&])(token)=[^&\s]+/g;
const redactingLogger = logger((message, ...rest) => {
	const redacted =
		typeof message === "string"
			? message.replace(SENSITIVE_QUERY_RE, "$1$2=REDACTED")
			: message;
	console.log(redacted, ...rest);
});

initSentry();

process.on("uncaughtException", (err) => {
	console.error("[relay] uncaughtException (suppressed)", err);
});
process.on("unhandledRejection", (reason) => {
	console.error("[relay] unhandledRejection (suppressed)", reason);
});

type AppContext = {
	Variables: {
		auth: AuthContext;
		token: string;
		hostId: string;
		// Set by the auth middleware when a WS upgrade targets a tunnel owned by
		// another relay instance: the WS handler bridges to that instance over
		// Fly's private network instead of fly-replaying (which can't route a
		// WS upgrade).
		proxyOwner: { region: string; machineId: string };
	};
};

const app = new Hono<AppContext>();
const tunnelManager = new TunnelManager();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Graceful drain on Fly's pre-stop signal. Fly's init sends SIGINT (not
// SIGTERM) to the main process during rolling deploys; listen on both to
// also cover hand-rolled `fly machine stop` and local Ctrl-C. Without this,
// deploys kill the process while tunnels are open and host-services see
// TCP-RST'd sockets, triggering their long exponential backoff.
//
// Sequence: stop accepting new TCP connections (server.close), then close
// every open tunnel with the app-defined drain code so hosts reconnect
// promptly, and clear this machine's directory ownership before process exit.
// server is assigned at the bottom of this file — by signal time, the closure
// has it.
let server: ReturnType<typeof serve> | null = null;
let draining = false;
const handleDrain = async (signal: string) => {
	if (draining) return;
	draining = true;
	console.log(`[relay] ${signal} received, draining tunnels`);
	try {
		server?.close();
		const cleared = await tunnelManager.drain({
			clearDirectory: () =>
				directory.clearStaleEntriesForMachine(
					env.FLY_REGION,
					env.FLY_MACHINE_ID,
				),
		});
		if (cleared > 0) {
			console.log(`[relay] cleared ${cleared} directory entries during drain`);
		}
	} catch (err) {
		console.error("[relay] drain failed", err);
	}
	process.exit(0);
};
process.on("SIGINT", () => void handleDrain("SIGINT"));
process.on("SIGTERM", () => void handleDrain("SIGTERM"));

app.use("*", redactingLogger);
app.use("*", cors());

app.onError((err, c) => {
	captureSentryException(err, {
		op: "hono.onError",
		path: new URL(c.req.url).pathname,
	});
	return c.json({ error: "Internal server error" }, 500);
});

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

function pathAfterHost(c: Context<AppContext>): string {
	const hostId = c.req.param("hostId") ?? "";
	const path = new URL(c.req.url).pathname;
	return path.slice(`/hosts/${hostId}`.length);
}

const authMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
	const wantsTrpc = isTrpcPath(pathAfterHost(c));

	const token = extractToken(c);
	if (!token)
		return wantsTrpc
			? trpcErrorResponse(c, "UNAUTHORIZED", "Unauthorized")
			: c.json({ error: "Unauthorized" }, 401);

	const auth = await verifyJWT(token, env.NEXT_PUBLIC_API_URL);
	if (!auth)
		return wantsTrpc
			? trpcErrorResponse(c, "UNAUTHORIZED", "Unauthorized")
			: c.json({ error: "Unauthorized" }, 401);

	const hostId = c.req.param("hostId");
	if (!hostId) return c.json({ error: "Missing hostId" }, 400);

	// Replay BEFORE the access check: if this machine doesn't own the
	// tunnel, the destination machine will authorize the request — no need
	// to double-bill the API for checkHostAccess on every cross-machine hop.
	if (!tunnelManager.hasTunnel(hostId)) {
		const isWsUpgrade = c.req.header("upgrade")?.toLowerCase() === "websocket";

		// fly-replay can't route a WS upgrade — the replay header rides on a
		// response that only arrives after the handshake, so the browser sees a
		// non-101 status and fails with 1006/502. So WS upgrades never fly-replay:
		// when another instance owns the tunnel, hand the WS handler the owner so
		// it bridges over Fly's private network instead. A `_rlp=1` hop that
		// reached us means the directory is stale (we were told we own it but
		// don't) — fail so the upstream relay closes and the client reconnects,
		// rather than re-proxying into a loop.
		if (isWsUpgrade) {
			const isProxyHop = c.req.query(PROXY_HOP_PARAM) === "1";
			if (!isProxyHop) {
				const owner = await directory.lookup(hostId).catch((err) => {
					captureSentryException(err, { op: "directory.lookup", hostId });
					return null;
				});
				const ownedElsewhere =
					owner != null &&
					!(
						owner.region === env.FLY_REGION &&
						owner.machineId === env.FLY_MACHINE_ID
					);
				if (ownedElsewhere) {
					c.set("auth", auth);
					c.set("token", token);
					c.set("hostId", hostId);
					c.set("proxyOwner", owner);
					return next();
				}
			}
			return c.json({ error: "Host not connected" }, 503);
		}

		const replay = await maybeReplay(hostId);
		if (replay) return c.body(null, 200, replay.header);
		return wantsTrpc
			? trpcErrorResponse(c, "SERVICE_UNAVAILABLE", "Host is not online")
			: c.json({ error: "Host not connected" }, 503);
	}

	const access = await checkHostAccess(auth, token, hostId);
	if (!access.ok) {
		const detail = `Forbidden: ${accessDenialMessage(access.reason)}`;
		return wantsTrpc
			? trpcErrorResponse(c, "FORBIDDEN", detail)
			: c.json({ error: detail }, 403);
	}

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
				if (draining) {
					ws.close(TunnelManager.WS_CLOSE_DRAIN, "Server draining for deploy");
					return;
				}

				if (!hostId || !token) {
					ws.close(1008, "Missing hostId or token");
					return;
				}

				const auth = await verifyJWT(token, env.NEXT_PUBLIC_API_URL);
				if (!auth) {
					ws.close(1008, "Unauthorized");
					return;
				}

				const access = await checkHostAccess(auth, token, hostId);
				if (!access.ok) {
					ws.close(1008, `Forbidden: ${accessDenialMessage(access.reason)}`);
					return;
				}

				if (draining) {
					ws.close(TunnelManager.WS_CLOSE_DRAIN, "Server draining for deploy");
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
		const message = error instanceof Error ? error.message : "Proxy error";
		return trpcErrorResponse(c, "BAD_GATEWAY", message);
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

		// Cross-instance bridge: this node doesn't own the tunnel, so relay the
		// WS to the owning instance over Fly's private network and pipe frames
		// both ways. The owning node runs the normal access check + channel path.
		const proxyOwner = c.get("proxyOwner");
		if (proxyOwner) {
			const target = internalProxyUrl(proxyOwner, hostId, path, url.search, {
				appName: env.FLY_APP_NAME,
				port: env.RELAY_PORT,
			});
			return createProxyBridge(target);
		}

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

// Clear any directory entries our previous process generation left behind
// (SIGKILL, drain race, etc.) before we begin accepting connections, so
// fly-replay doesn't route cross-region requests at us for tunnels we no
// longer have. Best-effort: relay still boots if Upstash is unreachable.
try {
	const cleared = await directory.clearStaleEntriesForMachine(
		env.FLY_REGION,
		env.FLY_MACHINE_ID,
	);
	if (cleared > 0) {
		console.log(
			`[relay] cleared ${cleared} stale directory entries on startup`,
		);
	}
} catch (err) {
	console.error("[relay] startup cleanup failed", err);
}

// Bind dual-stack (`::`) rather than the default `0.0.0.0`. Fly's private
// 6PN network (`<machine>.vm.<app>.internal`) is IPv6-only, and relay-to-relay
// WS proxying dials peers over it; `::` accepts both the public IPv4 proxy
// traffic (IPv4-mapped, V6ONLY=0 on Linux) and 6PN IPv6 peer connections.
server = serve(
	{ fetch: app.fetch, port: env.RELAY_PORT, hostname: "::" },
	(info) => {
		console.log(
			`[relay] listening on [::]:${info.port} (region=${env.FLY_REGION} machine=${env.FLY_MACHINE_ID})`,
		);
	},
);
injectWebSocket(server);

// Disable Nagle's algorithm on every incoming connection. Both the client's
// terminal WebSocket and the host's tunnel WebSocket connect here, so this
// covers the relay's writes in both directions. Nagle interacting with TCP
// delayed-ACK adds tens-to-hundreds of milliseconds to small, sparse
// interactive frames (terminal keystrokes and their echoes) while leaving
// bulk output untouched; across the relay's multiple hops this compounds into
// seconds of perceived typing lag. Interactive proxies should always set
// TCP_NODELAY. (@hono/node-server returns a Node http.Server.)
(server as unknown as import("node:http").Server).on(
	"connection",
	(socket: import("node:net").Socket) => {
		socket.setNoDelay(true);
	},
);
