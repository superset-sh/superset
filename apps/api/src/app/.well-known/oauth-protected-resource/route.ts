import { auth } from "@superset/auth/server";
import { buildProtectedResourceMetadata } from "@/lib/oauth-metadata";

export async function GET(request: Request): Promise<Response> {
	const authServerMetadata = await auth.api.getOAuthServerConfig({
		headers: request.headers,
	});

	return Response.json(
		buildProtectedResourceMetadata(request, "/", {
			authorizationServerUrl:
				typeof authServerMetadata.issuer === "string"
					? authServerMetadata.issuer
					: undefined,
			resourceName: "Superset MCP Server",
			scopesSupported: Array.isArray(authServerMetadata.scopes_supported)
				? authServerMetadata.scopes_supported
				: undefined,
		}),
		{
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "max-age=3600",
			},
		},
	);
}
