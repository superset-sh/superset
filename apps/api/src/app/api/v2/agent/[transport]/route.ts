import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	createMcpServer,
	isMcpUnauthorized,
	type McpContext,
	resolveMcpContext,
} from "@superset/mcp-v2";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import { getOAuthProtectedResourceMetadataUrl } from "@/lib/oauth-metadata";

function unauthorizedResponse(req: Request, message: string): Response {
	return new Response(
		JSON.stringify({ error: { code: "UNAUTHORIZED", message } }),
		{
			status: 401,
			headers: {
				"WWW-Authenticate": `Bearer realm="superset", resource_metadata="${getOAuthProtectedResourceMetadataUrl(req)}"`,
				"Content-Type": "application/json",
			},
		},
	);
}

async function handle(req: Request): Promise<Response> {
	let ctx: McpContext;
	try {
		ctx = await resolveMcpContext(req, {
			apiUrl: env.NEXT_PUBLIC_API_URL,
			relayUrl: env.RELAY_URL,
		});
	} catch (error) {
		if (isMcpUnauthorized(error)) {
			return unauthorizedResponse(req, error.message);
		}
		throw error;
	}

	const server = createMcpServer({
		onToolCall: (event) => {
			posthog.capture({
				distinctId: event.userId,
				event: "mcp_tool_called",
				properties: {
					tool: event.toolName,
					organization_id: event.organizationId,
					auth_source: event.source,
					client_label: event.clientLabel,
					duration_ms: event.durationMs,
					success: event.success,
					error_message: event.errorMessage,
					mcp_server: "superset-v2",
					mcp_server_version: "0.1.0",
				},
				groups: { organization: event.organizationId },
			});
		},
	});
	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);

	return transport.handleRequest(req, {
		authInfo: {
			token: ctx.bearerToken,
			clientId: ctx.source === "api-key" ? "api-key" : "oauth",
			scopes: ["mcp:full"],
			extra: { mcpContext: ctx },
		},
	});
}

export { handle as GET, handle as POST, handle as DELETE };
