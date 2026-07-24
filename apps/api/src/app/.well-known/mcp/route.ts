import { getRequestOrigin } from "@/lib/oauth-metadata";

export function GET(request: Request): Response {
	const origin = getRequestOrigin(request);

	return Response.json(
		{
			servers: [
				{
					name: "superset",
					description:
						"Superset MCP server — orchestrate parallel coding agents, workspaces, automations, and tasks.",
					url: `${origin}/api/v2/agent/mcp`,
					transport: "streamable-http",
					serverCard: `${origin}/.well-known/mcp/server-card.json`,
					authentication: {
						type: "oauth2",
						resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
					},
					documentation: "https://docs.superset.sh/mcp-server",
				},
				{
					name: "superset-docs",
					description:
						"Superset documentation over MCP — search and read docs pages.",
					url: "https://docs.superset.sh/mcp",
					transport: "streamable-http",
					authentication: { type: "none" },
				},
			],
		},
		{
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "public, max-age=3600, s-maxage=3600",
			},
		},
	);
}
