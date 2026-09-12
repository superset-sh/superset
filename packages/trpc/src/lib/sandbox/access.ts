import {
	sandboxEdgeUrl,
	sandboxHostSecret,
	signSandboxEdgeTicket,
} from "@superset/shared/sandbox-edge";
import { env } from "../../env";

/**
 * A ticket outlives a sandbox session (four hours, extended while open):
 * the box is guarded by its own secret, so the ticket bounds how long a
 * person's open workspace stays addressable without asking again.
 */
const TICKET_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Where a client reaches this workspace and what it presents there. The
 * authorization decision — is this person allowed in — happens before this
 * is called; this only turns a yes into an address and a ticket.
 */
export async function mintSandboxEdgeAccess(args: {
	workspaceId: string;
	userId: string;
	port: number;
	target: string;
}): Promise<{ url: string; token: string; expiresAt: Date }> {
	const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
	const token = await signSandboxEdgeTicket(env.SANDBOX_EDGE_SECRET, {
		workspaceId: args.workspaceId,
		userId: args.userId,
		port: args.port,
		target: args.target,
		exp: Math.floor(expiresAt.getTime() / 1000),
	});
	return {
		url: sandboxEdgeUrl(env.SANDBOX_EDGE_ORIGIN, args.workspaceId, args.port),
		token,
		expiresAt,
	};
}

/** The bearer host-service in this workspace's sandbox is booted with and the edge presents. */
export function sandboxHostSecretFor(workspaceId: string): Promise<string> {
	return sandboxHostSecret(env.SANDBOX_EDGE_SECRET, workspaceId);
}
