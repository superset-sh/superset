import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { auth } from "@superset/auth/server";
import { createMcpServer } from "@superset/mcp";
import { handleMcpRequest, type McpRequestDeps } from "./auth-flow";

const deps: McpRequestDeps = {
	authApi: auth.api,
	createServer: createMcpServer,
	createTransport: () => new WebStandardStreamableHTTPServerTransport(),
};

async function handleRequest(req: Request): Promise<Response> {
	return handleMcpRequest(req, deps);
}

export { handleRequest as GET, handleRequest as POST, handleRequest as DELETE };
