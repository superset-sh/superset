import { COMPANY } from "@superset/shared/constants";
import { API_URL, MCP_SERVER_URL } from "@/lib/llms";

export function GET() {
	const baseUrl = COMPANY.MARKETING_URL;

	const linkset = {
		linkset: [
			{
				anchor: API_URL,
				"service-desc": [
					{
						href: `${API_URL}/openapi.json`,
						type: "application/vnd.oai.openapi+json",
						title: "Superset API OpenAPI 3.1 specification",
					},
				],
				"service-doc": [
					{
						href: `${COMPANY.DOCS_URL}/mcp`,
						type: "text/html",
						title: "Superset MCP server documentation",
					},
					{
						href: `${baseUrl}/auth.md`,
						type: "text/markdown",
						title: "Agent authentication walkthrough",
					},
				],
				"service-meta": [
					{
						href: `${API_URL}/.well-known/oauth-protected-resource`,
						type: "application/json",
						title: "OAuth protected resource metadata (RFC 9728)",
					},
					{
						href: `${baseUrl}/.well-known/mcp/server-card.json`,
						type: "application/json",
						title: "MCP server card",
					},
				],
				item: [
					{
						href: MCP_SERVER_URL,
						title: "Superset MCP server (Streamable HTTP)",
					},
				],
			},
		],
	};

	return Response.json(linkset, {
		headers: {
			"Content-Type":
				'application/linkset+json;profile="https://www.rfc-editor.org/info/rfc9727"',
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
