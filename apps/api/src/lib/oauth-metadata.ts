export interface ProtectedResourceMetadataOptions {
	authorizationServerUrl?: string;
	resourceName?: string;
	resourceDocumentation?: string;
	scopesSupported?: string[];
}

function getFirstForwardedValue(value: string | null): string | undefined {
	return value
		?.split(",")
		.map((part) => part.trim())
		.find(Boolean);
}

export function getRequestOrigin(req: Request): string {
	const requestUrl = new URL(req.url);
	const host =
		getFirstForwardedValue(req.headers.get("x-forwarded-host")) ??
		requestUrl.host;
	const proto =
		getFirstForwardedValue(req.headers.get("x-forwarded-proto")) ??
		requestUrl.protocol.replace(":", "");

	return `${proto}://${host}`;
}

export function normalizeResourcePath(pathname: string): string {
	if (!pathname || pathname === "/") {
		return "";
	}

	return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function getOAuthProtectedResourceMetadataUrl(req: Request): string {
	const requestUrl = new URL(req.url);
	return `${getRequestOrigin(req)}/.well-known/oauth-protected-resource${normalizeResourcePath(
		requestUrl.pathname,
	)}`;
}

/**
 * The resource every Superset MCP endpoint authorizes against. Plugin
 * endpoints live under /mcp/plugins/<marketplace>/<plugin>, an unbounded path
 * the authorization server's audience allowlist cannot enumerate, so they
 * present the one audience it already issues. Nothing scopes a token to a
 * single endpoint anyway: the audience check is on the token, not the path.
 */
export const MCP_RESOURCE_PATH = "/mcp";

export function mcpProtectedResourceMetadataUrl(req: Request): string {
	return `${getRequestOrigin(req)}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`;
}

export function mcpUnauthorizedResponse(
	req: Request,
	message: string,
): Response {
	return new Response(
		JSON.stringify({ error: { code: "UNAUTHORIZED", message } }),
		{
			status: 401,
			headers: {
				"WWW-Authenticate": `Bearer realm="superset", resource_metadata="${mcpProtectedResourceMetadataUrl(req)}"`,
				"Content-Type": "application/json",
			},
		},
	);
}

export function buildProtectedResourceMetadata(
	req: Request,
	resourcePath: string,
	options: ProtectedResourceMetadataOptions,
): Record<string, unknown> {
	const origin = getRequestOrigin(req);
	const normalizedResourcePath = normalizeResourcePath(resourcePath);

	return {
		resource: `${origin}${normalizedResourcePath}`,
		...(options.authorizationServerUrl
			? { authorization_servers: [options.authorizationServerUrl] }
			: {}),
		...(options.scopesSupported?.length
			? { scopes_supported: options.scopesSupported }
			: {}),
		...(options.resourceName ? { resource_name: options.resourceName } : {}),
		...(options.resourceDocumentation
			? { resource_documentation: options.resourceDocumentation }
			: {}),
	};
}
