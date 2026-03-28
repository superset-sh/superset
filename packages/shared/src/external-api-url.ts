interface ResolveExternalApiUrlOptions {
	apiUrl: string;
	externalApiUrl?: string | null;
	path?: string;
}

export function resolveExternalApiUrl({
	apiUrl,
	externalApiUrl,
	path,
}: ResolveExternalApiUrlOptions): string {
	const baseUrl = externalApiUrl ?? apiUrl;

	if (!path) {
		return baseUrl;
	}

	return new URL(path, baseUrl).toString();
}
