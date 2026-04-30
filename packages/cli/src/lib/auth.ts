import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { CLIError } from "@superset/cli-framework";
import { env } from "./env";

const LOOPBACK_CANDIDATES = [51789, 51790];

export interface LoginResult {
	accessToken: string;
	expiresAt: number;
}

function generateState(): string {
	return randomBytes(32).toString("base64url");
}

function loopbackUrl(port: number): string {
	return `http://127.0.0.1:${port}/callback`;
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
	);
}

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
			timeoutMs,
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
				.end("<h1>Signed in</h1><p>You can close this tab.</p>");
			finish(null, code);
		});
	});
}

export function getWebUrl(): string {
	if (process.env.SUPERSET_WEB_URL) return process.env.SUPERSET_WEB_URL;
	return env.SUPERSET_API_URL.replace("api.superset.sh", "app.superset.sh");
}

export async function login(signal: AbortSignal): Promise<LoginResult> {
	const apiUrl = env.SUPERSET_API_URL;
	const webUrl = getWebUrl();

	const { server, port } = await bindLoopbackServer();
	const redirectUri = loopbackUrl(port);
	const state = generateState();

	const authorizeUrl = new URL(`${webUrl}/cli/authorize`);
	authorizeUrl.searchParams.set("redirect_uri", redirectUri);
	authorizeUrl.searchParams.set("state", state);

	await openBrowser(authorizeUrl.toString());

	const code = await waitForCallback({
		server,
		port,
		expectedState: state,
		signal,
		timeoutMs: 5 * 60 * 1000,
	});

	const response = await fetch(`${apiUrl}/api/cli/exchange`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code }),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new CLIError(
			`Token exchange failed: ${response.status} ${body}`,
			"Try `superset auth login` again.",
		);
	}

	const data = (await response.json()) as { token: string; expiresAt: string };
	return {
		accessToken: data.token,
		expiresAt: new Date(data.expiresAt).getTime(),
	};
}
