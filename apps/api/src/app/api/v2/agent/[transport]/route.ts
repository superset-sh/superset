import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	createMcpServer,
	isMcpUnauthorized,
	type McpContext,
	resolveMcpContext,
} from "@superset/mcp-v2";
import { env } from "@/env";
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
		ctx = await resolveMcpContext(req, env.NEXT_PUBLIC_API_URL);
	} catch (error) {
		if (isMcpUnauthorized(error)) {
			return unauthorizedResponse(req, error.message);
		}
		throw error;
	}

	const server = createMcpServer();
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
