import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { auth } from "@superset/auth/server";
import { createMcpServer } from "@superset/mcp";
import { verifyAccessToken } from "better-auth/oauth2";
import { env } from "@/env";
import { handleMcpRequest, type McpRequestDeps } from "./auth-flow";

// MCP uses long-lived SSE/streaming connections. Without an explicit
// maxDuration, Vercel kills the function after the plan default (300 s),
// causing "Task timed out after 300 seconds" for any session > ~5 min.
// Set to the Pro plan maximum (800 s).
export const maxDuration = 800;

const deps: McpRequestDeps = {
	apiUrl: env.NEXT_PUBLIC_API_URL,
	authApi: auth.api,
	createServer: createMcpServer,
	createTransport: () => new WebStandardStreamableHTTPServerTransport(),
	verifyAccessToken,
};

async function handleRequest(req: Request): Promise<Response> {
	return handleMcpRequest(req, deps);
}

export { handleRequest as GET, handleRequest as POST, handleRequest as DELETE };
