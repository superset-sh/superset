import { COMPANY } from "@superset/shared/constants";
import { API_URL, MCP_SERVER_URL } from "@/lib/llms";

const FALLBACK_CARD = {
	name: "superset",
	description:
		"Superset MCP server: create Git-worktree workspaces, launch coding-agent sessions, schedule automations, open terminals, and manage tasks on behalf of a Superset user.",
	version: "0.1.0",
	serverUrl: MCP_SERVER_URL,
	transport: "streamable-http",
	documentationUrl: `${COMPANY.DOCS_URL}/mcp`,
	authentication: {
		type: "oauth2",
		resourceMetadataUrl: `${API_URL}/.well-known/oauth-protected-resource`,
	},
	tools: [] as unknown[],
};

export async function GET() {
	let card: unknown = FALLBACK_CARD;
	try {
		const response = await fetch(
			`${API_URL}/.well-known/mcp/server-card.json`,
			{ next: { revalidate: 3600 } },
		);
		if (response.ok) {
			card = await response.json();
		}
	} catch {
		// api unreachable — serve the static fallback
	}

	return Response.json(card, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
