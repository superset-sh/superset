import { auth } from "@superset/auth/server";
import { toNextJsHandler } from "better-auth/next-js";
import { verifyAccessToken } from "better-auth/oauth2";
import { env } from "@/env";
import { isUntrustedAuthorizedParty } from "@/lib/trusted-clients";

const { GET: _GET, POST: _POST } = toNextJsHandler(auth);

const apiUrl = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

/**
 * The native Better Auth userinfo endpoint returns the token subject's
 * identity but does not validate `azp`. Reject a victim-scoped token minted to
 * an attacker-registered DCR client before it can leak the victim's identity
 * (cross-tenant ATO), mirroring the MCP and tRPC boundary checks. Tokens that
 * fail verification fall through to Better Auth's own handling.
 */
async function rejectsUntrustedUserInfo(req: Request): Promise<boolean> {
	const match = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1];
	if (!token || token.split(".").length !== 3) return false;

	try {
		const payload = (await verifyAccessToken(token, {
			jwksUrl: `${apiUrl}/api/auth/jwks`,
			verifyOptions: {
				issuer: apiUrl,
				audience: [apiUrl, `${apiUrl}/`],
			},
		})) as Record<string, unknown>;
		return isUntrustedAuthorizedParty(payload);
	} catch {
		return false;
	}
}

/**
 * Normalize localhost variants in a URL so that `localhost` and `127.0.0.1`
 * are treated as equivalent. OAuth 2.1 requires exact string matching on
 * redirect_uri, but some MCP clients (e.g. OpenCode) register with
 * `127.0.0.1` and then authorize with `localhost` (or vice-versa).
 */
function normalizeLocalhostUri(uri: string): string {
	return uri.replace(/^(https?:\/\/)localhost(:\d+)/, "$1127.0.0.1$2");
}

const GET = async (req: Request) => {
	const url = new URL(req.url);
	if (url.pathname.endsWith("/oauth2/userinfo")) {
		if (await rejectsUntrustedUserInfo(req)) {
			return new Response("Unauthorized", { status: 401 });
		}
	}
	if (url.pathname.endsWith("/oauth2/authorize")) {
		const redirectUri = url.searchParams.get("redirect_uri");
		if (redirectUri) {
			const normalized = normalizeLocalhostUri(redirectUri);
			if (normalized !== redirectUri) {
				url.searchParams.set("redirect_uri", normalized);
				return _GET(new Request(url.toString(), req));
			}
		}
	}
	return _GET(req);
};

const POST = async (req: Request) => {
	const url = new URL(req.url);
	if (url.pathname.endsWith("/oauth2/userinfo")) {
		if (await rejectsUntrustedUserInfo(req)) {
			return new Response("Unauthorized", { status: 401 });
		}
	}
	if (url.pathname.endsWith("/oauth2/register")) {
		const cloned = req.clone();
		const body = await cloned.json().catch(() => null);
		if (body?.redirect_uris && Array.isArray(body.redirect_uris)) {
			body.redirect_uris = body.redirect_uris.map(normalizeLocalhostUri);
			return _POST(
				new Request(req.url, {
					method: req.method,
					headers: req.headers,
					body: JSON.stringify(body),
				}),
			);
		}
	}
	if (url.pathname.endsWith("/oauth2/token")) {
		const cloned = req.clone();
		const contentType = req.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const body = await cloned.json().catch(() => null);
			if (body?.redirect_uri && typeof body.redirect_uri === "string") {
				const normalized = normalizeLocalhostUri(body.redirect_uri);
				if (normalized !== body.redirect_uri) {
					body.redirect_uri = normalized;
					return _POST(
						new Request(req.url, {
							method: req.method,
							headers: req.headers,
							body: JSON.stringify(body),
						}),
					);
				}
			}
		} else {
			const params = new URLSearchParams(await cloned.text());
			const redirectUri = params.get("redirect_uri");
			if (redirectUri) {
				const normalized = normalizeLocalhostUri(redirectUri);
				if (normalized !== redirectUri) {
					params.set("redirect_uri", normalized);
					return _POST(
						new Request(req.url, {
							method: req.method,
							headers: req.headers,
							body: params.toString(),
						}),
					);
				}
			}
		}
	}
	return _POST(req);
};

export { GET, POST };
