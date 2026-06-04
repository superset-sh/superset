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
