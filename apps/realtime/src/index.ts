import * as Sentry from "@sentry/cloudflare";
import { PAGE_STORAGE_TICKET_SECONDS } from "@superset/shared/page-storage";
import { readable, writableFor } from "@superset/shared/page-storage-access";
import type { PageStorageHubRequest } from "@superset/shared/page-storage-hub";
import {
	isRealtimeNudgeKind,
	isRealtimeUpdate,
} from "@superset/shared/realtime";
import {
	signPageConnectTicket,
	verifyPageConnectTicket,
} from "@superset/shared/usercontent";
import { verifyJWT } from "@superset/shared/verify-jwt";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getServerByName } from "partyserver";
import { OrgHub } from "./org-hub";
import { CLAIMS_HEADER, PageHub } from "./page-hub";
import type { RealtimeEnv } from "./types";

type AppContext = { Bindings: RealtimeEnv };

const app = new Hono<AppContext>();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

function extractToken(c: Context<AppContext>): string | null {
	const header = c.req.header("Authorization");
	if (header?.startsWith("Bearer ")) return header.slice(7);
	return c.req.query("token") ?? null;
}

// A failed auth on a WebSocket upgrade completes the handshake and closes
// with a reason, the only way a browser client can see why.
function acceptAndClose(code: number, reason: string): Response {
	const pair = new WebSocketPair();
	pair[1].accept();
	pair[1].close(code, reason);
	return new Response(null, { status: 101, webSocket: pair[0] });
}

// ── Subscribe: one socket per window, per organization ─────────────

app.get("/v2/org/:organizationId/nudges", async (c) => {
	if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const organizationId = c.req.param("organizationId");
	const token = extractToken(c);
	if (!token) return acceptAndClose(4401, "Unauthorized");
	const auth = await verifyJWT(token, c.env.NEXT_PUBLIC_API_URL);
	if (!auth) return acceptAndClose(4401, "Unauthorized");
	// Nudges carry no data, so organization membership is the whole check.
	if (!auth.organizationIds.includes(organizationId)) {
		return acceptAndClose(4403, "Not a member of this organization");
	}
	const stub = await getServerByName(c.env.OrgHub, organizationId);
	return stub.fetch("https://realtime/subscribe", {
		headers: { Upgrade: "websocket" },
	});
});

app.post("/v2/page/:pageId/storage/admin", async (c) => {
	const token = extractToken(c);
	if (!token || token !== c.env.NUDGE_SECRET) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	const request = (await c.req
		.json()
		.catch(() => null)) as PageStorageHubRequest | null;
	if (!request || typeof request.op !== "string") {
		return c.json({ error: "op required" }, 400);
	}
	const stub = await getServerByName(c.env.PageHub, c.req.param("pageId"));
	return c.json(await stub.apply(request));
});

app.post("/v2/page/:pageId/storage/manifest-changed", async (c) => {
	const token = extractToken(c);
	if (!token || token !== c.env.NUDGE_SECRET) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	const stub = await getServerByName(c.env.PageHub, c.req.param("pageId"));
	await stub.manifestChanged();
	return c.json({ ok: true });
});

app.post("/v2/page/:pageId/storage/ticket", async (c) => {
	const pageId = c.req.param("pageId");
	const token = extractToken(c);
	if (!token) return c.json({ error: "Unauthorized" }, 401);
	const auth = await verifyJWT(token, c.env.NEXT_PUBLIC_API_URL);
	if (!auth) return c.json({ error: "Unauthorized" }, 401);

	const stub = await getServerByName(c.env.PageHub, pageId);
	const manifest = await stub.readManifest();
	if (!manifest) return c.json({ error: "Not found" }, 404);

	const viewer = { userId: auth.sub, organizationIds: auth.organizationIds };
	if (!readable(manifest, viewer)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const nonce = crypto.randomUUID();
	const ticket = await signPageConnectTicket(c.env.NUDGE_SECRET, {
		pageId,
		userId: auth.sub,
		name: auth.name ?? "Someone",
		image: auth.image ?? null,
		organizationIds: auth.organizationIds,
		author: manifest.createdByUserId === auth.sub,
		writable: writableFor(manifest, viewer),
		nonce,
		exp: Math.floor(Date.now() / 1000) + PAGE_STORAGE_TICKET_SECONDS,
	});

	return c.json({ ticket });
});

app.get("/v2/page/:pageId/storage/socket", async (c) => {
	if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const pageId = c.req.param("pageId");
	const ticket = c.req.query("ticket");
	if (!ticket) return acceptAndClose(4401, "Unauthorized");
	const claims = await verifyPageConnectTicket(c.env.NUDGE_SECRET, ticket);
	if (!claims || claims.pageId !== pageId) {
		return acceptAndClose(4401, "Unauthorized");
	}

	const stub = await getServerByName(c.env.PageHub, pageId);
	const headers = new Headers({ Upgrade: "websocket" });
	headers.set(
		CLAIMS_HEADER,
		JSON.stringify({
			userId: claims.userId,
			name: claims.name,
			image: claims.image,
			organizationIds: claims.organizationIds,
			nonce: claims.nonce,
		}),
	);
	const origin = c.req.header("origin");
	if (origin) headers.set("origin", origin);
	return stub.fetch("https://realtime/subscribe", { headers });
});

// ── Emit: the API, after a write ────────────────────────────────────

app.post("/v2/nudge", async (c) => {
	const token = extractToken(c);
	if (!token || token !== c.env.NUDGE_SECRET) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	const body = (await c.req.json().catch(() => null)) as {
		organizationId?: unknown;
		kind?: unknown;
		update?: unknown;
	} | null;
	const organizationId = body?.organizationId;
	if (typeof organizationId !== "string" || organizationId.length === 0) {
		return c.json({ error: "organizationId required" }, 400);
	}
	if (!isRealtimeNudgeKind(body?.kind)) {
		return c.json({ error: "unknown kind" }, 400);
	}
	if (body?.update !== undefined && !isRealtimeUpdate(body.update)) {
		return c.json({ error: "invalid update" }, 400);
	}
	const stub = await getServerByName(c.env.OrgHub, organizationId);
	await stub.nudge(body.kind, body?.update);
	return c.json({ ok: true });
});

// Exceptions only, as on the relay: console capture at this volume is a
// memory leak, and a peer going away is not an error.
function isPeerGone(message: string): boolean {
	return (
		message === "Network connection lost." ||
		message.startsWith(
			"Connection closed: this Durable Object instance is no longer active",
		)
	);
}

const sentryOptions = (env: RealtimeEnv): Sentry.CloudflareOptions => ({
	dsn: env.SENTRY_DSN,
	sendDefaultPii: false,
	integrations: (defaults) =>
		defaults.filter((integration) => integration.name !== "Console"),
	beforeSend: (event) => {
		const message = event.exception?.values?.[0]?.value;
		return message && isPeerGone(message) ? null : event;
	},
});

const InstrumentedOrgHub = Sentry.instrumentDurableObjectWithSentry(
	sentryOptions,
	OrgHub,
);
const InstrumentedPageHub = Sentry.instrumentDurableObjectWithSentry(
	sentryOptions,
	PageHub,
);
export { InstrumentedOrgHub as OrgHub, InstrumentedPageHub as PageHub };

export default Sentry.withSentry(sentryOptions, {
	fetch: app.fetch,
} satisfies ExportedHandler<RealtimeEnv>);
