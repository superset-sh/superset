import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { CLIError } from "@superset/cli-framework";
import { type SupersetConfig, writeConfig } from "./config";

/**
 * Hardcoded `client_id` for the official Superset CLI. Matches the row
 * seeded server-side at API startup (see
 * `packages/db/src/seed-oauth-clients.ts` and
 * `apps/api/src/instrumentation.ts`). This is not a credential — it's an
 * identifier. Public clients have no client_secret; PKCE binds each flow
 * to the caller via the verifier. Every major CLI (`gcloud`, `gh`,
 * `stripe`, `aws`) ships a hardcoded public `client_id` for the same
 * reason: it lets the consent screen recognize first-party clients and
 * render them with a verified badge instead of treating every install as
 * an anonymous third party.
 */
const SUPERSET_CLI_CLIENT_ID = "superset-cli";

/**
 * Loopback ports the CLI tries in order when spawning the local OAuth
 * callback server. Must match the `redirect_uris` seeded for the
 * `superset-cli` client — Better Auth does exact-match port comparison,
 * so RFC 8252 §7.3 port-agnosticism is not in play.
 */
const LOOPBACK_CANDIDATES = [51789, 51790, 51791, 51792, 51793];

const CLI_SCOPES = ["openid", "profile", "email", "offline_access"];

export interface AuthorizationCodeResult {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
}

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type?: string;
}

function base64Url(input: Buffer): string {
	return input
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function generatePkce(): { verifier: string; challenge: string } {
	const verifier = base64Url(randomBytes(32));
	const challenge = base64Url(createHash("sha256").update(verifier).digest());
	return { verifier, challenge };
}

function generateState(): string {
	return base64Url(randomBytes(32));
}

function loopbackUrl(port: number): string {
	return `http://127.0.0.1:${port}/callback`;
}

/**
 * Open the system's default browser. Mirrors the platform-aware spawn used by
 * the previous device-flow login.
 */
async function openBrowser(url: string): Promise<void> {
	const cmd =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "start"
				: "xdg-open";
	const { exec } = await import("node:child_process");
	exec(`${cmd} "${url}"`);
}

/**
 * Try to bind a one-shot loopback HTTP server on the first free port from
 * `LOOPBACK_CANDIDATES`. Returns the bound server + the port it landed on.
 */
async function bindLoopbackServer(): Promise<{ server: Server; port: number }> {
	for (const port of LOOPBACK_CANDIDATES) {
		const server = createServer();
		const bound = await new Promise<boolean>((resolve) => {
			const onError = () => {
				server.removeListener("listening", onListening);
				resolve(false);
			};
			const onListening = () => {
				server.removeListener("error", onError);
				resolve(true);
			};
			server.once("error", onError);
			server.once("listening", onListening);
			server.listen(port, "127.0.0.1");
		});
		if (bound) return { server, port };
	}
	throw new CLIError(
		`All loopback ports in use: ${LOOPBACK_CANDIDATES.join(", ")}`,
		"Close other Superset CLI sessions or applications using these ports.",
	);
}

const SUCCESS_HTML = `<!doctype html>
<meta charset="utf-8">
<title>Superset CLI — signed in</title>
<style>
  body { font: 16px -apple-system, system-ui, sans-serif; padding: 4em; text-align: center; color: #111; }
  h1 { font-weight: 600; }
</style>
<h1>Signed in</h1>
<p>You can close this tab and return to the terminal.</p>
`;

const ERROR_HTML = `<!doctype html>
<meta charset="utf-8">
<title>Superset CLI — error</title>
<style>
  body { font: 16px -apple-system, system-ui, sans-serif; padding: 4em; text-align: center; color: #111; }
  h1 { font-weight: 600; color: #b00020; }
</style>
<h1>Authorization failed</h1>
<p>Check the terminal for details.</p>
`;

/**
 * Wait for the OAuth callback on the loopback server. Resolves with the
 * authorization code once it arrives. The server is closed in all cases —
 * success, state mismatch, abort, or timeout.
 */
function waitForCallback({
	server,
	port,
	expectedState,
	signal,
	timeoutMs,
}: {
	server: Server;
	port: number;
	expectedState: string;
	signal: AbortSignal;
	timeoutMs: number;
}): Promise<string> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (err: Error | null, code?: string) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
			server.close();
			if (err) reject(err);
			else if (code) resolve(code);
		};

		const timer = setTimeout(
			() => finish(new CLIError("Authorization timed out — please try again")),
			timeoutMs,
		);
		const onAbort = () => finish(new CLIError("Login cancelled"));
		signal.addEventListener("abort", onAbort);

		server.on("request", (req, res) => {
			const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
			if (url.pathname !== "/callback") {
				res.writeHead(404).end();
				return;
			}
			const code = url.searchParams.get("code");
			const state = url.searchParams.get("state");
			const error = url.searchParams.get("error");

			if (error) {
				res.writeHead(400, { "Content-Type": "text/html" }).end(ERROR_HTML);
				finish(new CLIError(`Authorization denied: ${error}`));
				return;
			}
			if (!code || !state) {
				res.writeHead(400, { "Content-Type": "text/html" }).end(ERROR_HTML);
				finish(new CLIError("Authorization callback missing code or state"));
				return;
			}
			if (state !== expectedState) {
				res.writeHead(400, { "Content-Type": "text/html" }).end(ERROR_HTML);
				finish(
					new CLIError(
						"Authorization state mismatch — possible CSRF, aborting",
					),
				);
				return;
			}
			res.writeHead(200, { "Content-Type": "text/html" }).end(SUCCESS_HTML);
			finish(null, code);
		});
	});
}

/**
 * OAuth 2.0 Authorization Code flow with PKCE and a loopback redirect.
 *
 * Per RFC 8252 ("OAuth 2.0 for Native Apps") this is the recommended flow
 * for CLIs. Replaces the previous Better Auth device flow, which couldn't
 * propagate the org selection from the consent page into the new bearer
 * session — JWTs minted via this flow carry the picked `organizationId` as
 * a custom claim baked in by `customAccessTokenClaims`, fixing the
 * multi-org login bug. To switch orgs, re-run `auth login` and pick a
 * different one on the consent screen.
 */
export async function authorizationCodeAuth(
	apiUrl: string,
	signal: AbortSignal,
): Promise<AuthorizationCodeResult> {
	const { server, port } = await bindLoopbackServer();
	const redirectUri = loopbackUrl(port);

	const { verifier, challenge } = generatePkce();
	const state = generateState();

	const authorizeUrl = new URL(`${apiUrl}/api/auth/oauth2/authorize`);
	authorizeUrl.searchParams.set("client_id", SUPERSET_CLI_CLIENT_ID);
	authorizeUrl.searchParams.set("redirect_uri", redirectUri);
	authorizeUrl.searchParams.set("response_type", "code");
	authorizeUrl.searchParams.set("scope", CLI_SCOPES.join(" "));
	authorizeUrl.searchParams.set("code_challenge", challenge);
	authorizeUrl.searchParams.set("code_challenge_method", "S256");
	authorizeUrl.searchParams.set("state", state);
	// `resource` is required so `oauthProvider` mints a JWT (audience-bound)
	// rather than an opaque token. Without it, `customAccessTokenClaims`
	// still runs but the result isn't reachable via JWKS verification.
	authorizeUrl.searchParams.set("resource", apiUrl);
	// Force the consent screen every time (OIDC `prompt=consent`). The CLI's
	// only way to switch orgs is to re-run `auth login`, so we always want
	// the user to see the org picker rather than having Better Auth
	// auto-approve from cached consent.
	authorizeUrl.searchParams.set("prompt", "consent");

	await openBrowser(authorizeUrl.toString());

	const code = await waitForCallback({
		server,
		port,
		expectedState: state,
		signal,
		timeoutMs: 5 * 60 * 1000,
	});

	const tokenRes = await fetch(`${apiUrl}/api/auth/oauth2/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			client_id: SUPERSET_CLI_CLIENT_ID,
			code_verifier: verifier,
			// `resource` on the token endpoint is what @better-auth/oauth-provider
			// actually reads (checkResource inspects `ctx.body.resource`). It's
			// also on the authorize URL above for RFC 8707 compliance, but the
			// server-side JWT mint decision keys off this body param.
			resource: apiUrl,
		}),
	});

	if (!tokenRes.ok) {
		const body = await tokenRes.text();
		throw new CLIError(
			`Token exchange failed: ${tokenRes.status} ${body}`,
			"Try `superset auth login` again.",
		);
	}

	const tokens = (await tokenRes.json()) as TokenResponse;
	if (!tokens.refresh_token) {
		throw new CLIError(
			"Token response missing refresh_token",
			"Make sure the OAuth provider supports the `offline_access` scope.",
		);
	}

	return {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: Date.now() + tokens.expires_in * 1000,
	};
}

/**
 * Exchange a refresh token for a fresh access token. Mutates `config.auth`
 * in place and persists. Called pre-emptively by the CLI middleware when the
 * stored access token is within 5 minutes of expiry.
 *
 * `oauthProvider` rotates refresh tokens by default; we accept either a
 * rotated value or fall back to the existing one if the server didn't send
 * a new one (handles both modes without configuration).
 */
export async function refreshAccessToken(
	config: SupersetConfig,
): Promise<void> {
	if (!config.auth) {
		throw new CLIError("Cannot refresh — not logged in");
	}
	const apiUrl = config.apiUrl ?? "https://api.superset.sh";

	const res = await fetch(`${apiUrl}/api/auth/oauth2/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: config.auth.refreshToken,
			client_id: SUPERSET_CLI_CLIENT_ID,
			resource: apiUrl,
		}),
	});

	if (!res.ok) {
		throw new CLIError(
			"Token refresh failed — please run `superset auth login` again",
		);
	}

	const tokens = (await res.json()) as TokenResponse;
	config.auth = {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token ?? config.auth.refreshToken,
		expiresAt: Date.now() + tokens.expires_in * 1000,
	};
	writeConfig(config);
}

/**
 * Decode an OAuth JWT payload without verifying the signature. Used to read
 * claims like `organizationId` and `email` after we've just minted the token
 * locally — verification is the server's job.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
	const parts = token.split(".");
	if (parts.length !== 3 || !parts[1]) {
		throw new CLIError("Malformed JWT");
	}
	const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
	const json = Buffer.from(
		padded.replaceAll("-", "+").replaceAll("_", "/"),
		"base64",
	).toString("utf-8");
	return JSON.parse(json) as Record<string, unknown>;
}
