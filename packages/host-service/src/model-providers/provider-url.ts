export function appendProviderPath(baseUrl: string, endpoint: string): string {
	const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
	const normalizedEndpoint = endpoint.startsWith("/")
		? endpoint
		: `/${endpoint}`;
	if (
		/\/v1$/i.test(normalizedBaseUrl) &&
		normalizedEndpoint.toLowerCase().startsWith("/v1/")
	) {
		return `${normalizedBaseUrl}${normalizedEndpoint.slice("/v1".length)}`;
	}
	return `${normalizedBaseUrl}${normalizedEndpoint}`;
}
