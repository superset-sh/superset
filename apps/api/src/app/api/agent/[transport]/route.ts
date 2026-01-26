import { auth } from "@superset/auth/server";
import { createMcpHandler, withMcpAuth } from "@vercel/mcp-adapter";
import { buildMcpContext, type McpContext } from "@/lib/mcp/auth";
import { registerMcpTools } from "@/lib/mcp/tools";

/**
 * Verify token using Better Auth (API key or OAuth)
 * Returns AuthInfo with McpContext in extra field
 */
async function verifyToken(
	req: Request,
	bearerToken?: string,
): Promise<
	| {
			token: string;
			clientId: string;
			scopes: string[];
			extra: { mcpContext: McpContext };
	  }
	| undefined
> {
	// 1. Try Better Auth session (handles x-api-key header via apiKey plugin)
	const session = await auth.api.getSession({
		headers: req.headers,
	});

	if (session?.session) {
		const { user, session: sess } = session;
		const extendedSession = sess as typeof sess & {
			activeOrganizationId?: string | null;
			role?: string;
			plan?: string | null;
		};

		if (!extendedSession.activeOrganizationId) {
			console.error("[mcp/auth] Session has no activeOrganizationId:", user.id);
			return undefined;
		}

		const mcpContext: McpContext = {
			userId: user.id,
			organizationId: extendedSession.activeOrganizationId,
			role: extendedSession.role ?? null,
			plan: extendedSession.plan ?? null,
			defaultDeviceId: null,
		};

		return {
			token: "session",
			clientId: "session",
			scopes: ["mcp:full"],
			extra: { mcpContext },
		};
	}

	// 2. Try MCP OAuth bearer token
	if (bearerToken) {
		const mcpSession = await auth.api.getMcpSession({
			headers: req.headers,
		});

		if (mcpSession) {
			// Extract organizationId from OAuth token scopes
			const rawScopes = mcpSession.scopes;
			const scopeArray = Array.isArray(rawScopes)
				? rawScopes
				: typeof rawScopes === "string"
					? rawScopes.split(" ")
					: [];
			const orgScope = scopeArray.find((s) => s.startsWith("organization:"));
			const organizationId = orgScope?.split(":")[1];

			if (!organizationId) {
				console.error(
					"[mcp/auth] OAuth token missing organization scope:",
					mcpSession.userId,
				);
				return undefined;
			}

			const mcpContext = await buildMcpContext({
				userId: mcpSession.userId,
				organizationId,
			});

			if (!mcpContext) {
				return undefined;
			}

			return {
				token: bearerToken,
				clientId: mcpSession.clientId ?? "mcp-client",
				scopes: scopeArray,
				extra: { mcpContext },
			};
		}
	}

	return undefined;
}

/**
 * Create the base MCP handler
 * Tools access context via extra.authInfo.extra.mcpContext
 */
const baseHandler = createMcpHandler(
	(server) => {
		registerMcpTools(server);
	},
	{
		capabilities: {
			tools: {},
		},
	},
	{
		redisUrl: process.env.UPSTASH_REDIS_URL,
		basePath: "/api/agent",
		verboseLogs: process.env.NODE_ENV === "development",
		maxDuration: 60,
	},
);

/**
 * Wrap with authentication
 */
const handler = withMcpAuth(baseHandler, verifyToken, {
	required: true,
});

export { handler as GET, handler as POST, handler as DELETE };
