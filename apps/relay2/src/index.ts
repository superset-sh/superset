import * as Sentry from "@sentry/cloudflare";
import { buildUpstreamHeaders } from "@superset/shared/host-routing";
import { RELAY_CLOSE } from "@superset/shared/tunnel-v2-protocol";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getServerByName } from "partyserver";
import { accessDenialMessage, checkHostAccess } from "./access";
import { type AuthContext, verifyJWT } from "./auth";
import { HostTunnel } from "./host-tunnel";
import { isTrpcPath, trpcErrorResponse } from "./trpc-error";
import type { RelayEnv } from "./types";

type AppContext = {
	Bindings: RelayEnv;
	Variables: {
		auth: AuthContext;
		token: string;
		hostId: string;
	};
};

const app = new Hono<AppContext>();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, region: "cf", proto: 2 }));

function extractToken(c: Context<AppContext>): string | null {
	const header = c.req.header("Authorization");
	if (header?.startsWith("Bearer ")) return header.slice(7);
	return c.req.query("token") ?? null;
}

function tunnelStub(c: Context<AppContext>, hostId: string) {
	return getServerByName(c.env.HostTunnel, hostId);
}

function isWsUpgrade(c: Context<AppContext>): boolean {
	return c.req.header("Upgrade")?.toLowerCase() === "websocket";
}

// A failed auth on a WebSocket upgrade completes the handshake and closes
// with a typed RELAY_CLOSE code + reason ≤123 bytes — the only way the peer
// can see *why* (browsers and plain WS clients cannot read a non-101
// response).
function acceptAndClose(code: number, reason: string): Response {
	const pair = new WebSocketPair();
	pair[1].accept();
	pair[1].close(code, reason);
	return new Response(null, { status: 101, webSocket: pair[0] });
}

type Denial = { status: 401 | 403 | 500; message: string };

async function authenticate(
	c: Context<AppContext>,
	hostId: string,
): Promise<{ auth: AuthContext; token: string } | Denial> {
	const token = extractToken(c);
	if (!token) return { status: 401, message: "Unauthorized" };
	const auth = await verifyJWT(token, c.env.NEXT_PUBLIC_API_URL);
	if (!auth) return { status: 401, message: "Unauthorized" };
	const access = await checkHostAccess(
		auth,
		token,
		hostId,
		c.env.NEXT_PUBLIC_API_URL,
	);
	if (!access.ok) {
		const message = `Forbidden: ${accessDenialMessage(access.reason)}`;
		// "error" means the access check itself failed (API unreachable), not
		// a denial — 500 so clients keep retrying instead of giving up.
		return access.reason === "error"
			? { status: 500, message }
			: { status: 403, message };
	}
	return { auth, token };
}

function isDenial(value: unknown): value is Denial {
	return typeof (value as Denial).status === "number";
}

// ── Host control channel ────────────────────────────────────────────

app.get("/v2/control", async (c) => {
	if (!isWsUpgrade(c)) {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const hostId = c.req.query("hostId");
	if (!hostId) return acceptAndClose(RELAY_CLOSE.badRequest, "Missing hostId");
	const result = await authenticate(c, hostId);
	if (isDenial(result)) {
		return acceptAndClose(
			result.status === 401 ? RELAY_CLOSE.authExpired : RELAY_CLOSE.forbidden,
			result.message,
		);
	}

	const stub = await tunnelStub(c, hostId);
	return stub.fetch(
		`https://relay2/register?hostId=${encodeURIComponent(hostId)}`,
		{ headers: { Upgrade: "websocket", "x-relay-token": result.token } },
	);
});

// ── Host dial-back (stream attach) ──────────────────────────────────
// The one-time ticket is the credential: unguessable, single-use, expires in
// DIAL_TIMEOUT_MS, and only ever issued to the authenticated host over its
// control channel. No JWT re-verification on this hot path.

app.get("/v2/dial", async (c) => {
	if (!isWsUpgrade(c)) {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const hostId = c.req.query("hostId");
	const ticket = c.req.query("ticket");
	if (!hostId || !ticket)
		return acceptAndClose(RELAY_CLOSE.badRequest, "Missing hostId or ticket");
	const stub = await tunnelStub(c, hostId);
	return stub.fetch(
		`https://relay2/dial?ticket=${encodeURIComponent(ticket)}`,
		{
			headers: { Upgrade: "websocket" },
		},
	);
});

// ── Batch presence (the DO is the presence authority) ───────────────

const MAX_PRESENCE_HOSTS = 50;

app.get("/presence", async (c) => {
	const hostIds = (c.req.query("hostIds") ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	if (hostIds.length === 0 || hostIds.length > MAX_PRESENCE_HOSTS) {
		return c.json({ error: `Provide 1-${MAX_PRESENCE_HOSTS} hostIds` }, 400);
	}
	const token = extractToken(c);
	if (!token) return c.json({ error: "Unauthorized" }, 401);
	const auth = await verifyJWT(token, c.env.NEXT_PUBLIC_API_URL);
	if (!auth) return c.json({ error: "Unauthorized" }, 401);

	// Denied and unknown hosts are omitted rather than erroring the batch: a
	// partial answer still renders every dot the caller may see.
	const entries = await Promise.all(
		hostIds.map(async (hostId) => {
			const access = await checkHostAccess(
				auth,
				token,
				hostId,
				c.env.NEXT_PUBLIC_API_URL,
			);
			if (!access.ok) return null;
			const stub = await tunnelStub(c, hostId);
			return [hostId, await stub.presenceInfo()] as const;
		}),
	);
	const hosts: Record<string, { online: boolean; lastSeenAt: number | null }> =
		{};
	for (const entry of entries) {
		if (entry) hosts[entry[0]] = entry[1];
	}
	return c.json({ hosts });
});

// ── Client-facing host routes (wire-identical to the v1 relay) ──────

function pathAfterHost(c: Context<AppContext>): string {
	const hostId = c.req.param("hostId") ?? "";
	return new URL(c.req.url).pathname.slice(`/hosts/${hostId}`.length);
}

app.get("/hosts/:hostId/_whoowns", async (c) => {
	const hostId = c.req.param("hostId");
	const result = await authenticate(c, hostId);
	if (isDenial(result)) {
		return c.json({ error: result.message }, result.status);
	}
	const stub = await tunnelStub(c, hostId);
	if (!(await stub.isConnected())) {
		return c.json({ error: "Host not connected" }, 503);
	}
	return c.json({ ok: true, region: "cf" });
});

const authMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
	const hostId = c.req.param("hostId");
	if (!hostId) return c.json({ error: "Missing hostId" }, 400);
	const result = await authenticate(c, hostId);
	if (isDenial(result)) {
		if (isTrpcPath(pathAfterHost(c))) {
			return trpcErrorResponse(
				c,
				result.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED",
				result.message,
			);
		}
		return c.json({ error: result.message }, result.status);
	}
	c.set("auth", result.auth);
	c.set("token", result.token);
	c.set("hostId", hostId);
	return next();
};

app.use("/hosts/:hostId/*", authMiddleware);

app.all("/hosts/:hostId/trpc/*", async (c) => {
	const hostId = c.get("hostId");
	const url = new URL(c.req.url);
	const path = pathAfterHost(c) || "/";
	const query = url.search.slice(1);

	const headers = buildUpstreamHeaders(c.req.raw.headers, c.get("auth").sub);

	const stub = await tunnelStub(c, hostId);
	const result = await stub.proxyHttp({
		method: c.req.method,
		pathWithQuery: query ? `${path}?${query}` : path,
		headers,
		body: new Uint8Array(await c.req.raw.arrayBuffer()),
	});
	if (!result.ok) {
		return (await stub.isConnected())
			? trpcErrorResponse(c, "BAD_GATEWAY", "Request timed out")
			: trpcErrorResponse(c, "SERVICE_UNAVAILABLE", "Host is not online");
	}
	return new Response(result.body.byteLength > 0 ? result.body : null, {
		status: result.status,
		headers: result.headers,
	});
});

app.get("/hosts/:hostId/*", async (c) => {
	if (!isWsUpgrade(c)) {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const hostId = c.get("hostId");
	const url = new URL(c.req.url);
	const path = pathAfterHost(c) || "/";
	if (path.startsWith("//")) return c.json({ error: "Invalid path" }, 400);
	const query = url.search.slice(1);
	const ticket = crypto.randomUUID();

	// The 101 is deferred until the host has dialed, so offline hosts fail
	// before the handshake instead of open-then-close.
	const stub = await tunnelStub(c, hostId);
	const prepared = await stub.prepareStream(ticket, path, query || undefined);
	if (prepared === "no-host") {
		return c.json({ error: "Host not connected" }, 503);
	}
	if (prepared === "timeout") {
		return c.json({ error: "Host did not answer" }, 504);
	}
	return stub.fetch(
		`https://relay2/client?ticket=${encodeURIComponent(ticket)}`,
		{ headers: { Upgrade: "websocket" } },
	);
});

// Exceptions only — console/breadcrumb capture stays off (the v1 relay's
// memory leak was Sentry's console firehose). No-op until SENTRY_DSN is set.
const sentryOptions = (env: RelayEnv): Sentry.CloudflareOptions => ({
	dsn: env.SENTRY_DSN,
	tracesSampleRate: 0,
	sendDefaultPii: false,
	integrations: (defaults) =>
		defaults.filter((integration) => integration.name !== "Console"),
});

const InstrumentedHostTunnel = Sentry.instrumentDurableObjectWithSentry(
	sentryOptions,
	HostTunnel,
);
export { InstrumentedHostTunnel as HostTunnel };

export default Sentry.withSentry(sentryOptions, {
	fetch: app.fetch,
} satisfies ExportedHandler<RelayEnv>);
