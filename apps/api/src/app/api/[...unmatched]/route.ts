import { getOAuthProtectedResourceMetadataUrl } from "@/lib/oauth-metadata";

function notFound(request: Request): Response {
	const origin = new URL(getOAuthProtectedResourceMetadataUrl(request)).origin;
	return Response.json(
		{
			error: {
				code: "NOT_FOUND",
				message: `No route matches ${new URL(request.url).pathname}.`,
				hint: `API surface: ${origin}/openapi.json. MCP server: ${origin}/api/v2/agent/mcp. Auth: https://superset.sh/auth.md`,
			},
		},
		{ status: 404 },
	);
}

export {
	notFound as GET,
	notFound as POST,
	notFound as PUT,
	notFound as PATCH,
	notFound as DELETE,
};
