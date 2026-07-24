import { getOAuthProtectedResourceMetadataUrl } from "@/lib/oauth-metadata";

function unauthorized(request: Request): Response {
	const origin = new URL(getOAuthProtectedResourceMetadataUrl(request)).origin;
	return Response.json(
		{
			error: {
				code: "UNAUTHORIZED",
				message: "Authentication required.",
				hint: `Authenticate via OAuth 2.1 (see https://superset.sh/auth.md) or a Superset API key, then use the MCP server at ${origin}/api/v2/agent/mcp. Tool catalog: ${origin}/.well-known/mcp/server-card.json`,
			},
		},
		{
			status: 401,
			headers: {
				"WWW-Authenticate": `Bearer realm="superset", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
			},
		},
	);
}

export { unauthorized as GET, unauthorized as POST };
