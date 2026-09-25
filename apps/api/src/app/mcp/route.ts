import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	createMcpServer,
	isMcpUnauthorized,
	MCP_SERVER_VERSION,
	type McpContext,
	resolveMcpContext,
} from "@superset/mcp";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import {
	checkRateLimit,
	rateLimitedResponse,
	withRateLimitHeaders,
} from "@/lib/mcp-rate-limit";
import {
	getRequestOrigin,
	mcpProtectedResourceMetadataUrl,
	mcpUnauthorizedResponse,
} from "@/lib/oauth-metadata";

// A plain GET (no `Accept: text/event-stream`) is not an MCP stream request;
// it is a human or an agent following a link. Describe the server instead of
// answering 401, so the endpoint URL itself resolves to something useful.
function describeServer(req: Request): Response {
	const origin = getRequestOrigin(req);
	return Response.json(
		{
			name: "superset",
			title: "Superset",
			version: MCP_SERVER_VERSION,
			description:
				"Superset MCP server (Model Context Protocol over Streamable HTTP). Create Git-worktree workspaces, launch coding-agent sessions, open terminals, schedule automations, and manage tasks on behalf of a Superset user.",
			transport: "streamable-http",
			url: `${origin}/mcp`,
			usage:
				"POST JSON-RPC 2.0 messages to this URL with `Accept: application/json, text/event-stream` and a Bearer token (OAuth 2.1 access token or Superset API key). Start with `initialize`, then `tools/list`.",
			serverCard: `${origin}/.well-known/mcp/server-card.json`,
			openapi: `${origin}/openapi.json`,
			documentation: "https://docs.superset.sh/mcp-server",
			authentication: {
				type: "oauth2",
				resourceMetadataUrl: mcpProtectedResourceMetadataUrl(req),
				walkthrough: "https://superset.sh/auth.md",
			},
			install: "https://superset.sh/mcp-install",
		},
		{
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "public, max-age=3600, s-maxage=3600",
			},
		},
	);
}

async function handle(req: Request): Promise<Response> {
	if (
		req.method === "GET" &&
		!(req.headers.get("accept") ?? "").includes("text/event-stream")
	) {
		return describeServer(req);
	}

	const rateLimitState = await checkRateLimit(req);
	if (rateLimitState && !rateLimitState.success) {
		return withRateLimitHeaders(rateLimitedResponse(), rateLimitState);
	}

	let ctx: McpContext;
	try {
		ctx = await resolveMcpContext(req, {
			apiUrl: env.NEXT_PUBLIC_API_URL,
			relayUrl: env.RELAY_URL,
		});
	} catch (error) {
		if (isMcpUnauthorized(error)) {
			return withRateLimitHeaders(
				mcpUnauthorizedResponse(req, error.message),
				rateLimitState,
			);
		}
		throw error;
	}

	ctx.relayUrl = env.RELAY_URL;

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
					mcp_server_version: MCP_SERVER_VERSION,
				},
				groups: { organization: event.organizationId },
			});
		},
	});
	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);

	const response = await transport.handleRequest(req, {
		authInfo: {
			token: ctx.bearerToken,
			clientId: ctx.source === "api-key" ? "api-key" : "oauth",
			scopes: ["mcp:full"],
			extra: { mcpContext: ctx },
		},
	});
	return withRateLimitHeaders(response, rateLimitState);
}

export const maxDuration = 800;

export { handle as GET, handle as POST, handle as DELETE };
