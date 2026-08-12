import { COMPANY } from "@superset/shared/constants";
import {
	API_URL,
	buildDeveloperResourcesSection,
	MCP_SERVER_URL,
} from "@/lib/llms";

export function GET() {
	const lines = [
		`# ${COMPANY.NAME} API`,
		"",
		`> Programmatic access to ${COMPANY.NAME} for AI agents: an MCP server (Streamable HTTP) plus OAuth 2.1 with dynamic client registration.`,
		"",
		`The primary API surface is the MCP server at ${MCP_SERVER_URL} (alias: ${API_URL}/mcp). Authenticate via OAuth 2.1 + PKCE or a Superset API key — walkthrough at ${COMPANY.MARKETING_URL}/auth.md.`,
		"",
		...buildDeveloperResourcesSection(),
	];

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
