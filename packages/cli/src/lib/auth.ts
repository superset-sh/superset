import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { CLIError } from "@superset/cli-framework";
import type { SupersetConfig } from "./config";

const LOOPBACK_CANDIDATES = [51789, 51790, 51791, 51792, 51793];

export interface LoginResult {
	accessToken: string;
	expiresAt: number;
}

function base64Url(input: Buffer): string {
	return input
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function generateState(): string {
	return base64Url(randomBytes(32));
}

function loopbackUrl(port: number): string {
	return `http://127.0.0.1:${port}/callback`;
}

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

const SUCCESS_HTML = `<!doctype html>
<meta charset="utf-8"><title>Superset CLI</title>
<style>body{font:16px system-ui,sans-serif;padding:4em;text-align:center}</style>
<h1>Signed in</h1><p>You can close this tab and return to the terminal.</p>`;

const ERROR_HTML = `<!doctype html>
<meta charset="utf-8"><title>Superset CLI</title>
<style>body{font:16px system-ui,sans-serif;padding:4em;text-align:center;color:#b00020}</style>
<h1>Authorization failed</h1><p>Check the terminal for details.</p>`;

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
			() => finish(new CLIError("Authorization timed out")),
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
				finish(new CLIError("Callback missing code or state"));
				return;
			}
			if (state !== expectedState) {
				res.writeHead(400, { "Content-Type": "text/html" }).end(ERROR_HTML);
				finish(new CLIError("State mismatch — possible CSRF"));
				return;
			}
			res.writeHead(200, { "Content-Type": "text/html" }).end(SUCCESS_HTML);
			finish(null, code);
		});
	});
}

export function getWebUrl(config: SupersetConfig): string {
	return (
		process.env.SUPERSET_WEB_URL ??
		config.apiUrl?.replace("api.", "app.").replace(":3101", ":3100") ??
		"https://app.superset.sh"
	);
}

export async function login(
	config: SupersetConfig,
	signal: AbortSignal,
): Promise<LoginResult> {
	const apiUrl = config.apiUrl ?? "https://api.superset.sh";
	const webUrl = getWebUrl(config);

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

	const res = await fetch(`${apiUrl}/api/cli/exchange`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code }),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new CLIError(
			`Token exchange failed: ${res.status} ${body}`,
			"Try `superset auth login` again.",
		);
	}

	const data = (await res.json()) as { token: string; expiresAt: string };
	return {
		accessToken: data.token,
		expiresAt: new Date(data.expiresAt).getTime(),
	};
}
