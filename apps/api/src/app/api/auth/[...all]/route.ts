import { auth } from "@superset/auth/server";
import {
	DATABASE_UNAVAILABLE_MESSAGE,
	isDatabaseConnectivityError,
} from "@superset/shared/db-connectivity-error";
import { toNextJsHandler } from "better-auth/next-js";

const { GET: _GET, POST: _POST } = toNextJsHandler(auth);

/**
 * Normalize localhost variants in a URL so that `localhost` and `127.0.0.1`
 * are treated as equivalent. OAuth 2.1 requires exact string matching on
 * redirect_uri, but some MCP clients (e.g. OpenCode) register with
 * `127.0.0.1` and then authorize with `localhost` (or vice-versa).
 */
function normalizeLocalhostUri(uri: string): string {
	return uri.replace(/^(https?:\/\/)localhost(:\d+)/, "$1127.0.0.1$2");
}

/**
 * Better Auth's dispatcher only catches its own `APIError`s (see
 * `better-auth/dist/api/dispatch.mjs`) — a raw driver failure (DB
 * unreachable) rethrows past it and becomes an opaque, bodiless 500 from
 * Next's default uncaught-exception handling. Callers (e.g. the desktop
 * dev sign-in flow) then have nothing but a status code to show. Detect
 * this specific, common-in-dev case and return a JSON body so it's
 * distinguishable from a real auth failure (bad credentials, etc).
 */
async function withAuthErrorHandling(
	handler: Promise<Response>,
): Promise<Response> {
	try {
		return await handler;
	} catch (error) {
		if (isDatabaseConnectivityError(error)) {
			console.error("[auth] Database unreachable:", error);
			return Response.json(
				{
					code: "DATABASE_UNAVAILABLE",
					message: DATABASE_UNAVAILABLE_MESSAGE,
				},
				{ status: 503 },
			);
		}
		throw error;
	}
}

const GET = async (req: Request) => {
	const url = new URL(req.url);
	if (url.pathname.endsWith("/oauth2/authorize")) {
		const redirectUri = url.searchParams.get("redirect_uri");
		if (redirectUri) {
			const normalized = normalizeLocalhostUri(redirectUri);
			if (normalized !== redirectUri) {
				url.searchParams.set("redirect_uri", normalized);
				return withAuthErrorHandling(_GET(new Request(url.toString(), req)));
			}
		}
	}
	return withAuthErrorHandling(_GET(req));
};

const POST = async (req: Request) => {
	const url = new URL(req.url);
	if (url.pathname.endsWith("/oauth2/register")) {
		const cloned = req.clone();
		const body = await cloned.json().catch(() => null);
		if (body?.redirect_uris && Array.isArray(body.redirect_uris)) {
			body.redirect_uris = body.redirect_uris.map(normalizeLocalhostUri);
			return withAuthErrorHandling(
				_POST(
					new Request(req.url, {
						method: req.method,
						headers: req.headers,
						body: JSON.stringify(body),
					}),
				),
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
					return withAuthErrorHandling(
						_POST(
							new Request(req.url, {
								method: req.method,
								headers: req.headers,
								body: JSON.stringify(body),
							}),
						),
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
					return withAuthErrorHandling(
						_POST(
							new Request(req.url, {
								method: req.method,
								headers: req.headers,
								body: params.toString(),
							}),
						),
					);
				}
			}
		}
	}
	return withAuthErrorHandling(_POST(req));
};

export { GET, POST };
