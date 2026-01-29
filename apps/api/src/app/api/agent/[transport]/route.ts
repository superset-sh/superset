import { auth } from "@superset/auth/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { env } from "@/env";
import type { McpContext } from "@/lib/mcp/auth";
import { registerTools } from "@/lib/mcp/tools";

async function verifyToken(req: Request, bearerToken?: string) {
	// 1. Try internal service auth (for Slack agent and other internal services)
	const internalOrgId = req.headers.get("X-Internal-Organization-Id");
	const internalUserId = req.headers.get("X-Internal-User-Id");
	if (internalOrgId && internalUserId) {
		// Internal requests are trusted when running in the same process
		// This is used by the Slack agent to call MCP tools on behalf of users
		console.log("[mcp/auth] Internal service auth:", {
			organizationId: internalOrgId,
			userId: internalUserId,
		});
		return {
			token: "internal",
			clientId: "slack-agent",
			scopes: ["mcp:full"],
			extra: {
				mcpContext: {
					userId: internalUserId,
					organizationId: internalOrgId,
				} satisfies McpContext,
			},
		};
	}

	// 2. Try session auth
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

	// 3. Try OAuth bearer token
	if (bearerToken) {
		const mcpSession = await auth.api.getMcpSession({ headers: req.headers });
		if (!mcpSession) return undefined;

		const scopes = Array.isArray(mcpSession.scopes)
			? mcpSession.scopes
			: (mcpSession.scopes?.split(" ") ?? []);

		// Get organization from scope
		const orgScope = scopes.find((s) => s.startsWith("organization:"));
		const organizationId = orgScope?.split(":")[1];

		if (!organizationId) {
			console.error("[mcp/auth] OAuth token missing organization scope");
			return undefined;
		}

		return {
			token: bearerToken,
			clientId: mcpSession.clientId ?? "mcp-client",
			scopes,
			extra: {
				mcpContext: {
					userId: mcpSession.userId,
					organizationId,
				} satisfies McpContext,
			},
		};
	}

	return undefined;
}

const baseHandler = createMcpHandler(
	(server) => registerTools(server),
	{ capabilities: { tools: {} } },
	{
		redisUrl: env.KV_URL,
		basePath: "/api/agent",
		verboseLogs: env.NODE_ENV === "development",
		maxDuration: 60,
	},
);

const handler = withMcpAuth(baseHandler, verifyToken, { required: true });

export { handler as GET, handler as POST, handler as DELETE };
