import { COMPANY } from "@superset/shared/constants";
import { API_URL, MCP_SERVER_URL } from "@/lib/llms";

export function GET() {
	return Response.json(
		{
			servers: [
				{
					name: "superset",
					description:
						"Superset MCP server — orchestrate parallel coding agents, workspaces, automations, and tasks.",
					url: MCP_SERVER_URL,
					transport: "streamable-http",
					serverCard: `${COMPANY.MARKETING_URL}/.well-known/mcp/server-card.json`,
					authentication: {
						type: "oauth2",
						resourceMetadataUrl: `${API_URL}/.well-known/oauth-protected-resource`,
					},
					documentation: `${COMPANY.DOCS_URL}/mcp`,
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
