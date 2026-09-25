import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createDocsMcpServer } from "@/lib/docs-mcp-server";

async function handleMcp(request: Request): Promise<Response> {
	const server = createDocsMcpServer();
	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);
	return transport.handleRequest(request);
}

export async function GET(request: Request): Promise<Response> {
	const accept = request.headers.get("accept") ?? "";
	if (accept.includes("text/event-stream")) {
		return handleMcp(request);
	}
	// Humans land here from old links to the /mcp docs page.
	return Response.redirect(new URL("/mcp-server", request.url), 308);
}

export { handleMcp as POST, handleMcp as DELETE };

export const maxDuration = 60;
