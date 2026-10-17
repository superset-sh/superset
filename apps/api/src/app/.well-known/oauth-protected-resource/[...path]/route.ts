import { auth } from "@superset/auth/server";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { buildProtectedResourceMetadata } from "@/lib/oauth-metadata";

interface RouteContext {
	params: Promise<{
		path: string[];
	}>;
}

export async function GET(
	request: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { path } = await params;
	const authServerMetadata = await auth.api.getOAuthServerConfig({
		headers: request.headers,
	});
	const resourcePath = `/${path.join("/")}`;

	return Response.json(
		buildProtectedResourceMetadata(request, resourcePath, {
			authorizationServerUrl:
				typeof authServerMetadata.issuer === "string"
					? authServerMetadata.issuer
					: undefined,
			resourceName: "Superset MCP Server",
			resourceDocumentation: `${CANONICAL_URLS.MARKETING}/auth.md`,
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
