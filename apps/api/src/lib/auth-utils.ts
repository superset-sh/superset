/**
 * Shared bearer-token helpers used by both the MCP route handler and the
 * tRPC context builder. Keep this file dependency-free so it can be imported
 * from anywhere without pulling in heavy auth machinery.
 */

export function getBearerToken(req: Request): string | undefined {
	const authorization = req.headers.get("authorization");
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	return match?.[1];
}

export function isApiKeyBearerToken(token: string): boolean {
	return token.startsWith("sk_live_");
}

export function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

export function parseApiKeyMetadata(
	metadata: unknown,
): Record<string, unknown> | null {
	if (!metadata) {
		return null;
	}

	if (typeof metadata === "string") {
		try {
			const parsed = JSON.parse(metadata);
			return parsed && typeof parsed === "object"
				? (parsed as Record<string, unknown>)
				: null;
		} catch (error) {
			console.error("[auth-utils] Failed to parse API key metadata:", error);
			return null;
		}
	}

	return typeof metadata === "object"
		? (metadata as Record<string, unknown>)
		: null;
}

export function normalizeApiUrl(apiUrl: string): string {
	return apiUrl.replace(/\/+$/, "");
}
