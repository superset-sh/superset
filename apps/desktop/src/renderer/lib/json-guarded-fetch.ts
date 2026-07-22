/**
 * Fetch wrapper for tRPC links, which call `response.json()` unconditionally
 * (through 11.18.0). When a proxy or CDN in front of the relay/API answers
 * with a plain-text or HTML error page (e.g. Vercel's `DEPLOYMENT_NOT_FOUND`),
 * that parse crashes with `Unexpected token 'T', "The deploy"... is not valid
 * JSON` and the raw SyntaxError reaches the user. This throws a readable HTTP
 * error instead.
 */
type FetchLike = (
	input: Parameters<typeof fetch>[0],
	init?: RequestInit,
) => Promise<Response>;

export function createJsonGuardedFetch(): FetchLike {
	return async (input, init) => {
		const response = await fetch(input, init);
		const contentType = response.headers.get("content-type") ?? "";
		if (response.status === 204 || contentType.includes("json")) {
			return response;
		}
		const body = (await response.text()).replace(/\s+/g, " ").trim();
		const detail = body ? `: ${body.slice(0, 160)}` : "";
		throw new Error(
			`${requestOrigin(input)} returned non-JSON (HTTP ${response.status})${detail}`,
		);
	};
}

function requestOrigin(input: Parameters<typeof fetch>[0]): string {
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: input.url;
	try {
		return new URL(url).origin;
	} catch {
		return url;
	}
}
