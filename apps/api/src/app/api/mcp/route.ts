import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	authenticateMcpRequest,
	createUnauthorizedResponse,
} from "@/lib/mcp/auth";
import { registerMcpTools } from "@/lib/mcp/tools";

/**
 * Create a new MCP server instance with tools registered
 */
function createMcpServer(ctx: {
	userId: string;
	organizationId: string;
	defaultDeviceId: string | null;
}) {
	const server = new McpServer(
		{
			name: "superset-mcp-server",
			version: "1.0.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerMcpTools(server, ctx);

	return server;
}

/**
 * Handle POST requests to the MCP endpoint
 * This is the main entry point for MCP tool calls
 */
export async function POST(request: Request): Promise<Response> {
	// Authenticate the request
	const ctx = await authenticateMcpRequest(request);

	if (!ctx) {
		return createUnauthorizedResponse();
	}

	try {
		// Create a fresh server instance for this request (stateless)
		const server = createMcpServer(ctx);

		// Create transport (stateless mode - no session management)
		const transport = new WebStandardStreamableHTTPServerTransport();

		// Connect server to transport
		await server.connect(transport);

		// Handle the request and return the response
		const response = await transport.handleRequest(request);

		return response;
	} catch (error) {
		console.error("[mcp] Error handling request:", error);

		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				error: {
					code: -32603,
					message: "Internal server error",
				},
				id: null,
			}),
			{
				status: 500,
				headers: {
					"Content-Type": "application/json",
				},
			},
		);
	}
}

/**
 * Handle GET requests - return method not allowed for stateless mode
 */
export async function GET(): Promise<Response> {
	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message:
					"Method not allowed. This MCP server operates in stateless mode - use POST requests only.",
			},
			id: null,
		}),
		{
			status: 405,
			headers: {
				"Content-Type": "application/json",
				Allow: "POST, OPTIONS",
			},
		},
	);
}

/**
 * Handle DELETE requests - return method not allowed for stateless mode
 */
export async function DELETE(): Promise<Response> {
	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message:
					"Method not allowed. This MCP server operates in stateless mode - sessions are not supported.",
			},
			id: null,
		}),
		{
			status: 405,
			headers: {
				"Content-Type": "application/json",
				Allow: "POST, OPTIONS",
			},
		},
	);
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function OPTIONS(): Promise<Response> {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
			"Access-Control-Allow-Headers":
				"Content-Type, X-API-Key, mcp-session-id, Last-Event-ID, mcp-protocol-version",
			"Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
			"Access-Control-Max-Age": "86400",
		},
	});
}
