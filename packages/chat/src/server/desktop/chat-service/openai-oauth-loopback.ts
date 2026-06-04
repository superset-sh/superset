import { createServer, type Server } from "node:http";

interface LoopbackOptions {
	host: string;
	port: number;
	path: string;
	onCallback: (callbackUrl: string) => void;
	onError?: (error: Error) => void;
}

export interface LoopbackTarget {
	host: string;
	port: number;
	path: string;
}

export function parseLoopbackTargetFromAuthUrl(
	authUrl: string,
): LoopbackTarget | null {
	try {
		const parsed = new URL(authUrl);
		const redirectUriRaw = parsed.searchParams.get("redirect_uri");
		if (!redirectUriRaw) return null;
		const redirectUri = new URL(redirectUriRaw);
		// `URL.hostname` keeps the brackets on IPv6 literals (e.g. "[::1]");
		// strip them for `server.listen`, which expects the bare address.
		const rawHostname = redirectUri.hostname;
		const host =
			rawHostname.startsWith("[") && rawHostname.endsWith("]")
				? rawHostname.slice(1, -1)
				: rawHostname;
		const isLoopback =
			host === "localhost" || host === "127.0.0.1" || host === "::1";
		if (!isLoopback) return null;
		const port = Number(redirectUri.port);
		if (!Number.isFinite(port) || port <= 0) return null;
		return { host, port, path: redirectUri.pathname || "/" };
	} catch {
		return null;
	}
}

export class OpenAIOAuthLoopback {
	private server: Server | null = null;

	async start(options: LoopbackOptions): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			// Bracket IPv6 literals when building the URL base so the parser
			// accepts them; the bare `options.host` may be "::1".
			const urlHost = options.host.includes(":")
				? `[${options.host}]`
				: options.host;
			const server = createServer((req, res) => {
				try {
					const requestUrl = new URL(
						req.url ?? "/",
						`http://${urlHost}:${options.port}`,
					);
					if (requestUrl.pathname !== options.path) {
						res.writeHead(404, { "content-type": "text/plain" });
						res.end("Not found");
						return;
					}

					const error = requestUrl.searchParams.get("error");
					const code = requestUrl.searchParams.get("code");
					if (error || !code) {
						const message = error ?? "Missing authorization code";
						res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
						res.end(renderErrorPage(message));
						options.onError?.(new Error(message));
						return;
					}

					res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
					res.end(SUCCESS_PAGE);
					options.onCallback(requestUrl.toString());
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					try {
						res.writeHead(500, { "content-type": "text/plain" });
						res.end(message);
					} catch {
						// Response may have already been sent — ignore.
					}
					options.onError?.(err instanceof Error ? err : new Error(message));
				}
			});

			const onListenError = (err: Error) => reject(err);
			server.once("error", onListenError);
			server.listen(options.port, options.host, () => {
				server.off("error", onListenError);
				this.server = server;
				resolve();
			});
		});
	}

	stop(): void {
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const PAGE_STYLES = `
html, body { margin: 0; height: 100%; }
body {
  display: flex; align-items: center; justify-content: center;
  font-family: -apple-system, system-ui, sans-serif;
  background: #151110; color: #eae8e6;
}
.card {
  max-width: 380px; padding: 32px; border-radius: 12px;
  border: 1px solid #2a2827; background: #201e1c; text-align: center;
}
h1 { font-size: 16px; margin: 0 0 8px; font-weight: 600; }
p { font-size: 13px; color: #a8a5a3; margin: 0; }
`;

const SUCCESS_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Superset · Connected</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
<div class="card">
<h1>Connected to OpenAI</h1>
<p>You can close this tab and return to Superset.</p>
</div>
</body>
</html>`;

function renderErrorPage(message: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Superset · Connection failed</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
<div class="card">
<h1>Connection failed</h1>
<p>${escapeHtml(message)}</p>
</div>
</body>
</html>`;
}
