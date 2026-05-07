import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { MCP_AUDIENCES } from "@superset/auth/oauth-audiences";
import {
	BearerAuthError,
	resolveBearerAuth,
} from "@superset/auth/resolve-bearer-auth";
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
	const bearer = await resolveBearerAuth(req.headers, {
		audiences: MCP_AUDIENCES,
	});

	if (bearer) {
		if (!bearer.activeOrganizationId) {
			// Bearer is structurally valid but has no usable org context.
			// Throw rather than fall through — never let a bearer-bearing
			// request authenticate via the victim's cookie session.
			throw new BearerAuthError(
				"invalid_token",
				"Bearer token has no organization context",
			);
		}
		// API keys get the legacy "all access" treatment (matches pre-refactor
		// main). OAuth-issued JWTs use exactly the scopes they were issued with
		// — never silently default an unscoped token to mcp:full.
		const scopes = bearer.kind === "apiKey" ? ["mcp:full"] : bearer.scopes;
		return {
			token: "bearer",
			clientId: bearer.kind === "apiKey" ? "api-key" : "mcp-client",
			scopes,
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
	let authInfo: AuthInfo | undefined;
	try {
		authInfo = await verifyToken(req, deps);
	} catch (error) {
		if (error instanceof BearerAuthError) {
			if (error.reason === "forbidden_org") {
				return new Response(error.message, { status: 403 });
			}
			console.error("[mcp/auth] Bearer rejected", {
				reason: error.reason,
				message: error.message,
			});
			return unauthorizedResponse(req);
		}
		throw error;
	}
	if (!authInfo) {
		return unauthorizedResponse(req);
	}

	const transport = deps.createTransport();
	const server = deps.createServer();
	await server.connect(transport);

	return transport.handleRequest(req, { authInfo });
}
