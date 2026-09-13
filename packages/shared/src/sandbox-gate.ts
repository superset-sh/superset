/**
 * A cloud workspace is reached through the sandbox gate, never at the
 * sandbox's own address. The API mints a ticket for a person's session — this
 * workspace, this port, this target, until it expires — as an HS256 JWT
 * signed with the secret it shares with the gate Worker. The Worker verifies
 * it, forwards the request to the target, and authenticates to host-service
 * with a per-sandbox secret derived from the same shared secret. The box has
 * exactly one caller, and nothing a client holds opens the box directly.
 */
import { errors, jwtVerify, SignJWT } from "jose";

/** The query param a WebSocket upgrade carries its ticket in; browsers cannot set headers on one. */
export const SANDBOX_GATE_TICKET_PARAM = "token";

const AUDIENCE = "superset-gate";
const encoder = new TextEncoder();

export interface SandboxGateTicketClaims {
	workspaceId: string;
	port: number;
	/** The origin the gate forwards to, e.g. https://<sandbox>.vercel.run */
	target: string;
	/** Stamped on every forwarded request; the box trusts the gate for it. */
	userId: string;
	/** Expiry, in seconds since the epoch. */
	exp: number;
}

export function signSandboxGateTicket(
	secret: string,
	claims: SandboxGateTicketClaims,
): Promise<string> {
	return new SignJWT({
		port: claims.port,
		target: claims.target,
		userId: claims.userId,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(claims.workspaceId)
		.setAudience(AUDIENCE)
		.setExpirationTime(claims.exp)
		.sign(encoder.encode(secret));
}

/** The claims for a ticket this secret signed that has not expired; null for anything else. */
export async function verifySandboxGateTicket(
	secret: string,
	ticket: string,
): Promise<SandboxGateTicketClaims | null> {
	try {
		const { payload } = await jwtVerify(ticket, encoder.encode(secret), {
			algorithms: ["HS256"],
			audience: AUDIENCE,
		});
		if (
			typeof payload.sub !== "string" ||
			typeof payload.port !== "number" ||
			typeof payload.target !== "string" ||
			typeof payload.userId !== "string" ||
			typeof payload.exp !== "number"
		) {
			return null;
		}
		return {
			workspaceId: payload.sub,
			port: payload.port,
			target: payload.target,
			userId: payload.userId,
			exp: payload.exp,
		};
	} catch (error) {
		if (error instanceof errors.JOSEError) return null;
		throw error;
	}
}

/** What host-service in this workspace's sandbox accepts as its bearer. */
export async function sandboxHostSecret(
	secret: string,
	workspaceId: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			"HMAC",
			key,
			encoder.encode(`host:${workspaceId}`),
		),
	);
	return btoa(String.fromCharCode(...signature))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export function sandboxGateHostLabel(
	workspaceId: string,
	port: number,
): string {
	return `${workspaceId}-${port}`;
}

/**
 * The client-facing URL for a workspace's port. `origin` is the gate with a
 * `*` where the per-workspace label goes (`https://*.sandbox.example.com`);
 * an origin without one — a local `wrangler dev` — serves every workspace.
 */
export function sandboxGateUrl(
	origin: string,
	workspaceId: string,
	port: number,
): string {
	return origin.replace("*", sandboxGateHostLabel(workspaceId, port));
}

export function parseSandboxGateHost(
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
