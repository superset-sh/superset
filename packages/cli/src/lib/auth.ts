import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { CLIError } from "@superset/cli-framework";
import { env } from "./env";

const CLIENT_ID = "superset-cli";
const PASTE_REDIRECT_PATH = "/cli/auth/code";
const SCOPE = "openid profile email offline_access";
const LOOPBACK_PORTS = [51789, 51790, 51791, 51792, 51793];
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const LOGIN_AGAIN_SUGGESTION = "Run `superset auth login` again.";

export interface LoginResult {
	accessToken: string;
	refreshToken?: string;
	expiresAt: number;
}

export interface LoginCallbacks {
	onAuthorizationUrl?: (url: string) => void;
	promptForPastedCode: (signal: AbortSignal) => Promise<string>;
	/**
	 * Injectable hooks so the OAuth flow can be unit-tested without spawning a
	 * browser, a real TTY, or a real loopback server. Default to the real
	 * implementations when omitted.
	 */
	openBrowser?: (url: string) => Promise<void>;
	shouldOpenBrowser?: () => boolean;
	bindLoopbackServer?: () => Promise<{
		server: Server;
		port: number;
	} | null>;
}

function base64url(buffer: Buffer): string {
	return buffer.toString("base64url");
}

function generateCodeVerifier(): string {
	return base64url(randomBytes(64));
}

function generateCodeChallenge(verifier: string): string {
	return base64url(createHash("sha256").update(verifier).digest());
}

function generateState(): string {
	return base64url(randomBytes(32));
}

async function openBrowser(url: string): Promise<void> {
	const { exec } = await import("node:child_process");
	switch (process.platform) {
		case "darwin":
			exec(`open "${url}"`);
			break;
		case "win32":
			exec(`start "" "${url}"`);
			break;
		default:
			exec(`xdg-open "${url}"`);
	}
}

export function getWebUrl(): string {
	return env.SUPERSET_WEB_URL;
}

function shouldOpenBrowser(): boolean {
	if (!process.stdout.isTTY) return false;
	if (process.env.CI) return false;
	if (process.env.SSH_CONNECTION || process.env.SSH_TTY) return false;
	return true;
}

async function bindLoopbackServer(): Promise<{
	server: Server;
	port: number;
} | null> {
	for (const port of LOOPBACK_PORTS) {
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
	return null;
}

function waitForCallback({
	server,
	port,
	expectedState,
	signal,
}: {
	server: Server;
	port: number;
	expectedState: string;
	signal: AbortSignal;
}): Promise<string> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (error: Error | null, code?: string) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
			server.close();
			if (error) reject(error);
			else if (code) resolve(code);
		};

		const timer = setTimeout(
			() => finish(new CLIError("Authorization timed out")),
			CALLBACK_TIMEOUT_MS,
		);
		const onAbort = () => finish(new CLIError("Login cancelled"));
		signal.addEventListener("abort", onAbort);

		server.on("request", (request, response) => {
			const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
			if (url.pathname !== "/callback") {
				response.writeHead(404).end();
				return;
			}
			const code = url.searchParams.get("code");
			const state = url.searchParams.get("state");
			const callbackError = url.searchParams.get("error");

			if (callbackError) {
				response
					.writeHead(400, { "Content-Type": "text/html" })
					.end("<h1>Authorization failed</h1>");
				finish(new CLIError(`Authorization denied: ${callbackError}`));
				return;
			}
			if (!code || !state) {
				response
					.writeHead(400, { "Content-Type": "text/html" })
					.end("<h1>Missing parameters</h1>");
				finish(new CLIError("Callback missing code or state"));
				return;
			}
			if (state !== expectedState) {
				response
					.writeHead(400, { "Content-Type": "text/html" })
					.end("<h1>State mismatch</h1>");
				finish(new CLIError("State mismatch — possible CSRF"));
				return;
			}
			response
				.writeHead(200, { "Content-Type": "text/html" })
				.end(
					"<h1>Signed in to Superset CLI</h1><p>You can close this tab.</p>",
				);
			finish(null, code);
		});
	});
}

function parsePastedCode(input: string): { code: string; state: string } {
	const trimmed = input.trim();
	const hashIdx = trimmed.indexOf("#");
	if (hashIdx === -1) {
		throw new CLIError(
			"Invalid code format",
			"Paste the entire code including the part after `#`.",
		);
	}
	const code = trimmed.slice(0, hashIdx);
	const state = trimmed.slice(hashIdx + 1);
	if (!code || !state) {
		throw new CLIError("Invalid code format", "Expected `<code>#<state>`.");
	}
	return { code, state };
}

function buildAuthorizeUrl({
	apiUrl,
	redirectUri,
	codeChallenge,
	state,
}: {
	apiUrl: string;
	redirectUri: string;
	codeChallenge: string;
	state: string;
}): URL {
	const url = new URL(`${apiUrl}/api/auth/oauth2/authorize`);
	url.searchParams.set("client_id", CLIENT_ID);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("scope", SCOPE);
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);
	url.searchParams.set("prompt", "consent");
	url.searchParams.set("resource", apiUrl);
	return url;
}

/**
 * Pick the single redirect_uri for a login and build the ONE `/authorize` URL
 * to present. The loopback and paste flows must share a redirect_uri — if they
 * differ, the second `/authorize` clobbers the first on the provider's side and
 * the consent step can resolve the wrong (or already-consumed) pending request,
 * so Authorize returns without a redirect URL (#6310).
 *
 * Loopback is used only when a port bound AND we're opening a local browser;
 * otherwise (SSH, non-TTY, CI, or bind failed) the paste URL is used. Returns
 * the URL and whether the loopback flow is active so the caller can open the
 * browser for exactly the same URL it prints.
 */
export function resolveAuthorizeUrl(opts: {
	apiUrl: string;
	webUrl: string;
	loopbackRedirectUri: string | null;
	codeChallenge: string;
	state: string;
	shouldOpenBrowser: boolean;
}): { authorizeUrl: string; useLoopback: boolean; redirectUri: string } {
	const pasteRedirectUri = new URL(PASTE_REDIRECT_PATH, opts.webUrl).toString();
	const useLoopback =
		opts.loopbackRedirectUri !== null && opts.shouldOpenBrowser;
	const redirectUri = useLoopback
		? opts.loopbackRedirectUri!
		: pasteRedirectUri;
	const authorizeUrl = buildAuthorizeUrl({
		apiUrl: opts.apiUrl,
		redirectUri,
		codeChallenge: opts.codeChallenge,
		state: opts.state,
	}).toString();
	return { authorizeUrl, useLoopback, redirectUri };
}

async function exchangeCodeForToken({
	apiUrl,
	code,
	codeVerifier,
	redirectUri,
}: {
	apiUrl: string;
	code: string;
	codeVerifier: string;
	redirectUri: string;
}): Promise<LoginResult> {
	const response = await fetch(`${apiUrl}/api/auth/oauth2/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			code_verifier: codeVerifier,
			client_id: CLIENT_ID,
			redirect_uri: redirectUri,
			resource: apiUrl,
		}),
	});

	if (!response.ok) {
		throw new CLIError(
			`Token exchange failed: ${response.status}`,
			LOGIN_AGAIN_SUGGESTION,
		);
	}

	const data = (await response.json()) as {
		access_token: string;
		token_type: string;
		expires_in?: number;
		refresh_token?: string;
	};

	const expiresIn = data.expires_in ?? 60 * 60;
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresAt: Date.now() + expiresIn * 1000,
	};
}

export async function refreshAccessToken(
	refreshToken: string,
): Promise<LoginResult> {
	const apiUrl = env.SUPERSET_API_URL;
	const response = await fetch(`${apiUrl}/api/auth/oauth2/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: CLIENT_ID,
			resource: apiUrl,
		}),
	});

	if (!response.ok) {
		throw new CLIError(
			`Token refresh failed: ${response.status}`,
			LOGIN_AGAIN_SUGGESTION,
		);
	}

	const data = (await response.json()) as {
		access_token: string;
		token_type: string;
		expires_in?: number;
		refresh_token?: string;
	};

	const expiresIn = data.expires_in ?? 60 * 60;
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token ?? refreshToken,
		expiresAt: Date.now() + expiresIn * 1000,
	};
}

export async function login(
	signal: AbortSignal,
	callbacks: LoginCallbacks,
): Promise<LoginResult> {
	const apiUrl = env.SUPERSET_API_URL;
	const webUrl = getWebUrl();

	const codeVerifier = generateCodeVerifier();
	const codeChallenge = generateCodeChallenge(codeVerifier);
	const state = generateState();

	const loopback = await (callbacks.bindLoopbackServer ?? bindLoopbackServer)();
	const loopbackRedirectUri = loopback
		? `http://127.0.0.1:${loopback.port}/callback`
		: null;
	const openBrowserImpl = callbacks.openBrowser ?? openBrowser;
	const shouldOpenBrowserImpl =
		callbacks.shouldOpenBrowser ?? shouldOpenBrowser;

	// Drive exactly ONE `/authorize` request per login — see `resolveAuthorizeUrl`.
	const { authorizeUrl, useLoopback, redirectUri } = resolveAuthorizeUrl({
		apiUrl,
		webUrl,
		loopbackRedirectUri,
		codeChallenge,
		state,
		shouldOpenBrowser: shouldOpenBrowserImpl(),
	});

	callbacks.onAuthorizationUrl?.(authorizeUrl);

	if (useLoopback) {
		void openBrowserImpl(authorizeUrl);
	}

	if (signal.aborted) {
		loopback?.server.close();
		throw new CLIError("Login cancelled");
	}

	const callbackController = new AbortController();
	const pasteController = new AbortController();

	type Winner = { code: string; redirectUri: string };
	let onOuterAbort: (() => void) | null = null;

	try {
		const winner = await new Promise<Winner>((resolve, reject) => {
			let settled = false;
			const settle = (fn: () => void) => {
				if (settled) return;
				settled = true;
				fn();
			};

			onOuterAbort = () => {
				settle(() => {
					callbackController.abort();
					pasteController.abort();
					reject(new CLIError("Login cancelled"));
				});
			};
			signal.addEventListener("abort", onOuterAbort);

			// Drive only the flow whose URL was presented. When the loopback
			// flow is active, no paste URL was shown, so running the paste prompt
			// lets an accidental/invalid paste abort a valid browser login and a
			// browser denial leaves the command waiting indefinitely. When the
			// paste flow is active, the browser was never opened, so only pasting
			// can complete it. Either way the code is exchanged with the single
			// chosen redirect_uri (#6310).
			if (loopback && useLoopback) {
				waitForCallback({
					server: loopback.server,
					port: loopback.port,
					expectedState: state,
					signal: callbackController.signal,
				}).then(
					(code) => {
						settle(() => {
							pasteController.abort();
							resolve({ code, redirectUri });
						});
					},
					(error) => {
						// The loopback flow is the only one offered; surface its
						// failure instead of leaving the command waiting forever.
						// Preserve the underlying reason (denial vs timeout vs CSRF)
						// so the user can tell a suspicious callback apart from a
						// normal failure.
						settle(() => {
							pasteController.abort();
							reject(
								new CLIError(
									error instanceof Error
										? error.message
										: "Browser login did not complete",
									"Run `superset auth login` again, or run it in a non-interactive terminal (no browser) to use the paste flow instead.",
								),
							);
						});
					},
				);
			} else {
				callbacks
					.promptForPastedCode(pasteController.signal)
					.then((pasted) => {
						if (pasteController.signal.aborted) return;
						try {
							const { code, state: returnedState } = parsePastedCode(pasted);
							if (returnedState !== state) {
								throw new CLIError(
									"State mismatch",
									"The pasted code does not match this login attempt. Run `superset auth login` again.",
								);
							}
							settle(() => {
								callbackController.abort();
								resolve({ code, redirectUri });
							});
						} catch (err) {
							settle(() => {
								callbackController.abort();
								reject(err);
							});
						}
					})
					.catch((err) => {
						if (pasteController.signal.aborted) return;
						settle(() => {
							callbackController.abort();
							reject(err);
						});
					});
			}
		});

		return await exchangeCodeForToken({
			apiUrl,
			code: winner.code,
			codeVerifier,
			redirectUri: winner.redirectUri,
		});
	} finally {
		if (onOuterAbort) signal.removeEventListener("abort", onOuterAbort);
		callbackController.abort();
		pasteController.abort();
		loopback?.server.close();
	}
}
