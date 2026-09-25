import { SUPERSET_USER_ID_HEADER } from "@superset/shared/host-routing";
import {
	parseSandboxGateHost,
	SANDBOX_GATE_TICKET_PARAM,
	sandboxHostSecret,
	verifySandboxGateTicket,
} from "@superset/shared/sandbox-gate";
import { assertEnv, type SandboxGateEnv } from "./env";

/**
 * The desktop renderer is a browser, so every call is cross-origin. A ticket
 * is what admits a request; the origin it came from adds nothing, and a
 * preflight carries no ticket, so it is answered here without one.
 */
const CORS_HEADERS: Record<string, string> = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
	"access-control-allow-headers": [
		"authorization",
		"content-type",
		"trpc-accept",
		"x-superset-client-machine-id",
		SUPERSET_USER_ID_HEADER,
	].join(", "),
	"access-control-max-age": "86400",
};

function ticketFrom(request: Request, url: URL): string | null {
	const header = request.headers.get("authorization");
	if (header?.startsWith("Bearer ")) return header.slice(7);
	return url.searchParams.get(SANDBOX_GATE_TICKET_PARAM);
}

function refused(): Response {
	return new Response(null, { status: 401, headers: CORS_HEADERS });
}

export default {
	async fetch(request, env) {
		assertEnv(env);
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}
		const url = new URL(request.url);
		const ticket = ticketFrom(request, url);
		const claims = ticket
			? await verifySandboxGateTicket(env.SANDBOX_GATE_SECRET, ticket)
			: null;
		if (!claims) return refused();
		// Every workspace is its own origin, so a ticket must not open one
		// workspace's hostname onto another's sandbox.
		if (env.SANDBOX_GATE_DOMAIN) {
			const bound = parseSandboxGateHost(url.hostname, env.SANDBOX_GATE_DOMAIN);
			if (
				!bound ||
				bound.workspaceId !== claims.workspaceId ||
				bound.port !== claims.port
			) {
				return refused();
			}
		}

		const hostSecret = await sandboxHostSecret(
			env.SANDBOX_GATE_SECRET,
			claims.workspaceId,
		);
		const upstream = new URL(`${url.pathname}${url.search}`, claims.target);
		if (upstream.searchParams.has(SANDBOX_GATE_TICKET_PARAM)) {
			upstream.searchParams.set(SANDBOX_GATE_TICKET_PARAM, hostSecret);
		}
		const headers = new Headers(request.headers);
		headers.set("authorization", `Bearer ${hostSecret}`);
		headers.set(SUPERSET_USER_ID_HEADER, claims.userId);

		const response = await fetch(upstream, {
			method: request.method,
			headers,
			body:
				request.method === "GET" || request.method === "HEAD"
					? undefined
					: request.body,
			redirect: "manual",
		});
		if (response.webSocket) return response;

		const out = new Response(response.body, response);
		for (const [name, value] of Object.entries(CORS_HEADERS)) {
			if (!out.headers.has(name)) out.headers.set(name, value);
		}
		return out;
	},
} satisfies ExportedHandler<SandboxGateEnv>;
