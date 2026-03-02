import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { auth } from "@superset/auth/server";
import { createMcpServer } from "@superset/mcp";
import type { McpContext } from "@superset/mcp/auth";
import { verifyAccessToken } from "better-auth/oauth2";
import { env } from "@/env";

async function verifyToken(req: Request): Promise<AuthInfo | undefined> {
	const authorization = req.headers.get("authorization");
	const bearerToken = authorization?.startsWith("Bearer ")
		? authorization.slice(7)
		: undefined;

	// 1. Try session auth (for desktop/web app)
	const session = await auth.api.getSession({ headers: req.headers });
	if (session?.session) {
		const extendedSession = session.session as {
			activeOrganizationId?: string;
		};
		if (!extendedSession.activeOrganizationId) {
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
					organizationId: extendedSession.activeOrganizationId,
				} satisfies McpContext,
			},
		};
	}

	// 2. Try API key verification (for sk_live_ tokens)
	if (bearerToken) {
		try {
			const result = await auth.api.verifyApiKey({
				body: { key: bearerToken },
			});
			if (result.valid && result.key) {
				const userId = result.key.userId;
				if (!userId) {
					console.error("[mcp/auth] API key missing userId");
					return undefined;
				}
				const metadata =
					typeof result.key.metadata === "string"
						? JSON.parse(result.key.metadata)
						: result.key.metadata;
				const organizationId = metadata?.organizationId as string | undefined;
				if (!organizationId) {
					console.error(
						"[mcp/auth] API key missing organizationId in metadata",
					);
					return undefined;
				}
				return {
					token: "api-key",
					clientId: "api-key",
					scopes: ["mcp:full"],
					extra: {
						mcpContext: {
							userId,
							organizationId,
						} satisfies McpContext,
					},
				};
			}
		} catch (error) {
			console.error("[mcp/auth] API key verification failed:", error);
		}
	}

	// 3. Try OAuth access token verification via JWKS
	if (bearerToken) {
		try {
			const payload = await verifyAccessToken(bearerToken, {
				jwksUrl: `${env.NEXT_PUBLIC_API_URL}/api/auth/jwks`,
				verifyOptions: {
					issuer: env.NEXT_PUBLIC_API_URL,
					audience: [env.NEXT_PUBLIC_API_URL, `${env.NEXT_PUBLIC_API_URL}/`],
				},
			});
			if (!payload?.sub || !payload.organizationId) {
				console.error(
					"[mcp/auth] Access token missing sub or organizationId claim",
				);
				return undefined;
			}

			const scopes = Array.isArray(payload.scope)
				? (payload.scope as string[])
				: typeof payload.scope === "string"
					? payload.scope.split(" ")
					: [];

			return {
				token: bearerToken,
				clientId: (payload.azp as string) ?? "mcp-client",
				scopes,
				extra: {
					mcpContext: {
						userId: payload.sub,
						organizationId: payload.organizationId as string,
					} satisfies McpContext,
				},
			};
		} catch (error) {
			console.error("[mcp/auth] Access token verification failed:", error);
			return undefined;
		}
	}

	return undefined;
}

function getResourceMetadataUrl(req: Request): string {
	const host = req.headers.get("x-forwarded-host") ?? new URL(req.url).host;
	const proto =
		req.headers.get("x-forwarded-proto") ??
		new URL(req.url).protocol.replace(":", "");
	return `${proto}://${host}/.well-known/oauth-protected-resource`;
}

function unauthorizedResponse(req: Request): Response {
	const metadataUrl = getResourceMetadataUrl(req);
	return new Response("Unauthorized", {
		status: 401,
		headers: {
			"WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"`,
		},
	});
}

async function handleRequest(req: Request): Promise<Response> {
	const authInfo = await verifyToken(req);
	if (!authInfo) return unauthorizedResponse(req);

	const transport = new WebStandardStreamableHTTPServerTransport();
	const server = createMcpServer();
	await server.connect(transport);

	return transport.handleRequest(req, { authInfo });
}

export { handleRequest as GET, handleRequest as POST, handleRequest as DELETE };
