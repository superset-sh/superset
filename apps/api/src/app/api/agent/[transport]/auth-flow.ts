import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { resolveBearerAuth } from "@superset/auth/resolve-bearer-auth";
import type { createMcpServer } from "@superset/mcp";
import type { McpContext } from "@superset/mcp/auth";
import { getOAuthProtectedResourceMetadataUrl } from "@/lib/oauth-metadata";

interface SessionUser {
	id: string;
}

interface SessionRecord {
	activeOrganizationId?: string | null;
}

interface SessionResponse {
	session?: SessionRecord | null;
	user: SessionUser;
}

export interface McpRequestDeps {
	authApi: {
		getSession(args: {
			headers: Headers;
		}): Promise<SessionResponse | null | undefined>;
	};
	createServer: typeof createMcpServer;
	createTransport: () => WebStandardStreamableHTTPServerTransport;
}

function buildSessionAuthInfo(session: SessionResponse): AuthInfo | undefined {
	const organizationId = session.session?.activeOrganizationId;

	if (!organizationId) {
		console.error("[mcp/auth] Session missing activeOrganizationId");
		return undefined;
	}

	return {
		token: "session",
		clientId: "session",
		scopes: ["mcp:full"],
		extra: {
			mcpContext: {
				userId: session.user.id,
				organizationId,
			} satisfies McpContext,
		},
	};
}

export async function verifyToken(
	req: Request,
	deps: McpRequestDeps,
): Promise<AuthInfo | undefined> {
	let bearer: Awaited<ReturnType<typeof resolveBearerAuth>> = null;
	try {
		bearer = await resolveBearerAuth(req.headers);
	} catch (error) {
		console.error("[mcp/auth] Bearer auth rejected", {
			message: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}

	if (bearer) {
		if (!bearer.activeOrganizationId) {
			console.error("[mcp/auth] Bearer missing organizationId");
			return undefined;
		}
		return {
			token: "bearer",
			clientId: bearer.kind === "apiKey" ? "api-key" : "mcp-client",
			scopes: bearer.scopes.length > 0 ? bearer.scopes : ["mcp:full"],
			extra: {
				mcpContext: {
					userId: bearer.userId,
					organizationId: bearer.activeOrganizationId,
				} satisfies McpContext,
			},
		};
	}

	const session = await deps.authApi.getSession({ headers: req.headers });
	if (session?.session) {
		return buildSessionAuthInfo(session);
	}

	return undefined;
}

export function unauthorizedResponse(req: Request): Response {
	return new Response("Unauthorized", {
		status: 401,
		headers: {
			"WWW-Authenticate": `Bearer resource_metadata="${getOAuthProtectedResourceMetadataUrl(
				req,
			)}"`,
		},
	});
}

export async function handleMcpRequest(
	req: Request,
	deps: McpRequestDeps,
): Promise<Response> {
	const authInfo = await verifyToken(req, deps);
	if (!authInfo) {
		return unauthorizedResponse(req);
	}

	const transport = deps.createTransport();
	const server = deps.createServer();
	await server.connect(transport);

	return transport.handleRequest(req, { authInfo });
}
