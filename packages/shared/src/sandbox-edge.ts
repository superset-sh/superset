/**
 * A cloud workspace is reached through the sandbox edge, never at the
 * sandbox's own address. The API mints a ticket for a person's session — this
 * workspace, this port, this target, until `exp` — signed with the secret it
 * shares with the edge Worker. The Worker verifies it, forwards the request
 * to the target, and authenticates to host-service with a per-sandbox secret
 * derived from the same shared secret. The box has exactly one caller, and
 * nothing a client holds opens the box directly.
 */
import { hmacBase64Url, signTicket, verifyTicket } from "./hmac-ticket";

/** The query param a WebSocket upgrade carries its ticket in; browsers cannot set headers on one. */
export const SANDBOX_EDGE_TICKET_PARAM = "token";

const KIND = "sandbox";

export interface SandboxEdgeTicketClaims {
	workspaceId: string;
	port: number;
	/** The origin the edge forwards to, e.g. https://<sandbox>.vercel.run */
	target: string;
	/** Stamped on every forwarded request; the box trusts the edge for it. */
	userId: string;
	/** Expiry, in seconds since the epoch. */
	exp: number;
}

interface Wire {
	k: string;
	w: string;
	p: number;
	t: string;
	u: string;
	exp: number;
}

export function signSandboxEdgeTicket(
	secret: string,
	claims: SandboxEdgeTicketClaims,
): Promise<string> {
	const wire: Wire = {
		k: KIND,
		w: claims.workspaceId,
		p: claims.port,
		t: claims.target,
		u: claims.userId,
		exp: claims.exp,
	};
	return signTicket(secret, wire);
}

export async function verifySandboxEdgeTicket(
	secret: string,
	ticket: string,
	now = Date.now(),
): Promise<SandboxEdgeTicketClaims | null> {
	const wire = (await verifyTicket(secret, ticket)) as Partial<Wire> | null;
	if (
		!wire ||
		wire.k !== KIND ||
		typeof wire.w !== "string" ||
		typeof wire.p !== "number" ||
		typeof wire.t !== "string" ||
		typeof wire.u !== "string" ||
		typeof wire.exp !== "number" ||
		wire.exp * 1000 <= now
	) {
		return null;
	}
	return {
		workspaceId: wire.w,
		port: wire.p,
		target: wire.t,
		userId: wire.u,
		exp: wire.exp,
	};
}

/** What host-service in this workspace's sandbox accepts as its bearer. */
export function sandboxHostSecret(
	secret: string,
	workspaceId: string,
): Promise<string> {
	return hmacBase64Url(secret, `host:${workspaceId}`);
}

export function sandboxEdgeHostLabel(
	workspaceId: string,
	port: number,
): string {
	return `${workspaceId}-${port}`;
}

/**
 * The client-facing URL for a workspace's port. `origin` is the edge with a
 * `*` where the per-workspace label goes (`https://*.sandbox.example.com`);
 * an origin without one — a local `wrangler dev` — serves every workspace.
 */
export function sandboxEdgeUrl(
	origin: string,
	workspaceId: string,
	port: number,
): string {
	return origin.replace("*", sandboxEdgeHostLabel(workspaceId, port));
}

export function parseSandboxEdgeHost(
	hostname: string,
	domain: string,
): { workspaceId: string; port: number } | null {
	const suffix = `.${domain}`;
	if (!hostname.endsWith(suffix)) return null;
	const label = hostname.slice(0, -suffix.length);
	const split = label.lastIndexOf("-");
	if (split <= 0) return null;
	const port = Number(label.slice(split + 1));
	if (!Number.isInteger(port) || port <= 0) return null;
	return { workspaceId: label.slice(0, split), port };
}
