export function gitlabMutationOriginAllowed(
	request: Request,
	origins: readonly string[],
): boolean {
	const origin = request.headers.get("origin");
	if (origin === null)
		return /^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "");
	return origins.some((allowed) => {
		try {
			return new URL(allowed).origin === origin;
		} catch {
			return false;
		}
	});
}

export function gitlabMutationRequest(
	request: Request,
	origins: readonly string[],
): Request | null {
	if (!gitlabMutationOriginAllowed(request, origins)) return null;
	if (request.headers.has("origin")) return request;
	const headers = new Headers(request.headers);
	headers.delete("cookie");
	return new Request(request, { headers });
}
