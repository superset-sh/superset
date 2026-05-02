import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { CLIError } from "@superset/cli-framework";
import { env } from "./env";

const CLIENT_ID = "superset-cli";
const PASTE_REDIRECT_PATH = "/cli/auth/code";
const SCOPE = "openid profile email";
const LOOPBACK_PORTS = [51789, 51790, 51791, 51792, 51793];
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export interface LoginResult {
	accessToken: string;
	expiresAt: number;
}

export interface LoginCallbacks {
	onAuthorizationUrl?: (url: string, mode: "loopback" | "paste") => void;
	promptForPastedCode: () => Promise<string>;
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

function shouldTryLoopback(): boolean {
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
		const body = await response.text();
		throw new CLIError(
			`Token exchange failed: ${response.status}`,
			body || "Run `superset auth login` again.",
		);
	}

	const data = (await response.json()) as {
		access_token: string;
		token_type: string;
		expires_in?: number;
	};

	const expiresIn = data.expires_in ?? 60 * 60 * 24 * 30;
	return {
		accessToken: data.access_token,
		expiresAt: Date.now() + expiresIn * 1000,
	};
}

export async function login(
	signal: AbortSignal,
	callbacks: LoginCallbacks,
): Promise<LoginResult> {
	const apiUrl = env.SUPERSET_API_URL;

	const codeVerifier = generateCodeVerifier();
	const codeChallenge = generateCodeChallenge(codeVerifier);
	const state = generateState();

	const loopback = shouldTryLoopback() ? await bindLoopbackServer() : null;

	if (loopback) {
		const redirectUri = `http://127.0.0.1:${loopback.port}/callback`;
		const authorizeUrl = buildAuthorizeUrl({
			apiUrl,
			redirectUri,
			codeChallenge,
			state,
		});

		callbacks.onAuthorizationUrl?.(authorizeUrl.toString(), "loopback");
		if (shouldOpenBrowser()) {
			void openBrowser(authorizeUrl.toString());
		}

		const code = await waitForCallback({
			server: loopback.server,
			port: loopback.port,
			expectedState: state,
			signal,
		});

		return exchangeCodeForToken({ apiUrl, code, codeVerifier, redirectUri });
	}

	const webUrl = getWebUrl();
	const redirectUri = `${webUrl}${PASTE_REDIRECT_PATH}`;
	const authorizeUrl = buildAuthorizeUrl({
		apiUrl,
		redirectUri,
		codeChallenge,
		state,
	});

	callbacks.onAuthorizationUrl?.(authorizeUrl.toString(), "paste");
	if (shouldOpenBrowser()) {
		void openBrowser(authorizeUrl.toString());
	}

	if (signal.aborted) throw new CLIError("Login cancelled");

	const pasted = await callbacks.promptForPastedCode();
	const { code, state: returnedState } = parsePastedCode(pasted);

	if (returnedState !== state) {
		throw new CLIError(
			"State mismatch",
			"The pasted code does not match this login attempt. Run `superset auth login` again.",
		);
	}

	return exchangeCodeForToken({ apiUrl, code, codeVerifier, redirectUri });
}
