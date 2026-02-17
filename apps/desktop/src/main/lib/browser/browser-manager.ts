import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { app, clipboard, type WebContents, webContents } from "electron";

interface ConsoleEntry {
	level: "log" | "warn" | "error" | "info" | "debug";
	message: string;
	timestamp: number;
}

const MAX_CONSOLE_ENTRIES = 500;

export interface AnnotationSubmission {
	annotations: unknown[];
	output: string;
	pageUrl: string;
}

class BrowserManager extends EventEmitter {
	private paneToWebContentsId = new Map<string, number>();
	private consoleLogs = new Map<string, ConsoleEntry[]>();
	private consoleListeners = new Map<string, () => void>();
	private annotationActive = new Set<string>();
	private webhookServer: Server | null = null;
	private webhookPort: number | null = null;

	register(paneId: string, webContentsId: number): void {
		this.paneToWebContentsId.set(paneId, webContentsId);
		this.setupConsoleCapture(paneId, webContentsId);
		this.setupWindowOpenHandler(paneId, webContentsId);
	}

	unregister(paneId: string): void {
		const cleanup = this.consoleListeners.get(paneId);
		if (cleanup) {
			cleanup();
			this.consoleListeners.delete(paneId);
		}
		this.annotationActive.delete(paneId);
		this.paneToWebContentsId.delete(paneId);
		this.consoleLogs.delete(paneId);
	}

	getWebContents(paneId: string): WebContents | null {
		const id = this.paneToWebContentsId.get(paneId);
		if (id === undefined) return null;
		try {
			return webContents.fromId(id) ?? null;
		} catch {
			return null;
		}
	}

	async screenshot(paneId: string): Promise<string> {
		const wc = this.getWebContents(paneId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		const image = await wc.capturePage();
		clipboard.writeImage(image);
		return image.toPNG().toString("base64");
	}

	async evaluateJS(paneId: string, code: string): Promise<unknown> {
		const wc = this.getWebContents(paneId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		return wc.executeJavaScript(code);
	}

	getConsoleLogs(paneId: string): ConsoleEntry[] {
		return this.consoleLogs.get(paneId) ?? [];
	}

	openDevTools(paneId: string): void {
		const wc = this.getWebContents(paneId);
		if (!wc) return;
		wc.openDevTools({ mode: "detach" });
	}

	/**
	 * Get the DevTools frontend URL for a browser pane by querying the CDP
	 * remote debugging server. This avoids the broken setDevToolsWebContents
	 * API (Electron issue #15874).
	 */
	async getDevToolsUrl(browserPaneId: string): Promise<string | null> {
		const wc = this.getWebContents(browserPaneId);
		if (!wc) return null;

		// Discover the CDP port from Chromium's command line switch
		const cdpPort = app.commandLine.getSwitchValue("remote-debugging-port");
		if (!cdpPort) return null;

		const targetUrl = wc.getURL();

		try {
			const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
			const targets = (await res.json()) as Array<{
				id: string;
				url: string;
				type: string;
				webSocketDebuggerUrl?: string;
			}>;

			// Webview guests have type "webview", not "page"
			const target = targets.find(
				(t) =>
					(t.type === "webview" || t.type === "page") && t.url === targetUrl,
			);
			if (!target) return null;

			return `http://127.0.0.1:${cdpPort}/devtools/inspector.html?ws=127.0.0.1:${cdpPort}/devtools/page/${target.id}`;
		} catch {
			return null;
		}
	}

	private annotationBundleCache: string | null = null;

	private getAnnotationBundle(): string {
		if (this.annotationBundleCache) return this.annotationBundleCache;

		// app.getAppPath() returns the desktop app root (e.g. apps/desktop) in both dev and prod.
		// In dev, the bundle lives in src/; in production it would be copied to dist/.
		const appRoot = app.getAppPath();
		const paths = [
			resolve(appRoot, "src/main/lib/browser/annotation/annotation-bundle.js"),
			resolve(appRoot, "dist/main/annotation-bundle.js"),
		];

		for (const p of paths) {
			try {
				this.annotationBundleCache = readFileSync(p, "utf-8");
				return this.annotationBundleCache;
			} catch {
				// try next path
			}
		}

		throw new Error(
			"Annotation bundle not found. Run: bun run apps/desktop/src/main/lib/browser/annotation/build-bundle.ts",
		);
	}

	/**
	 * Start a local HTTP server that receives webhook POSTs from agentation.
	 * Each pane gets a unique URL: http://127.0.0.1:<port>/<paneId>
	 * The server extracts the paneId from the URL path and emits events.
	 */
	private async startWebhookServer(): Promise<number> {
		if (this.webhookServer && this.webhookPort) return this.webhookPort;

		return new Promise((resolve, reject) => {
			const server = createServer(
				(req: IncomingMessage, res: ServerResponse) => {
					// CORS headers — the webview page makes cross-origin fetches to localhost.
					res.setHeader("Access-Control-Allow-Origin", "*");
					res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
					res.setHeader("Access-Control-Allow-Headers", "Content-Type");

					if (req.method === "OPTIONS") {
						res.writeHead(204);
						res.end();
						return;
					}

					if (req.method !== "POST") {
						res.writeHead(405);
						res.end();
						return;
					}

					let body = "";
					req.on("data", (chunk: Buffer) => {
						body += chunk.toString();
					});
					req.on("end", () => {
						try {
							const data = JSON.parse(body) as {
								event: string;
								annotation?: Record<string, unknown>;
								annotations?: unknown[];
								output?: string;
								url?: string;
							};
							// Extract paneId from URL path: /<paneId>
							const paneId = req.url?.replace(/^\//, "");
							if (paneId && data.event === "submit" && data.output) {
								this.emit(`annotations:submitted:${paneId}`, {
									annotations: data.annotations ?? [],
									output: data.output,
									pageUrl: data.url ?? "",
								} satisfies AnnotationSubmission);
							}
							if (
								paneId &&
								data.event === "annotation.add" &&
								data.annotation
							) {
								this.emit(`annotation:added:${paneId}`, {
									annotation: data.annotation,
									pageUrl: data.url ?? "",
								});
							}
							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ ok: true }));
						} catch {
							res.writeHead(400);
							res.end();
						}
					});
				},
			);

			server.listen(0, "127.0.0.1", () => {
				const addr = server.address() as AddressInfo;
				this.webhookPort = addr.port;
				this.webhookServer = server;
				resolve(addr.port);
			});
			server.on("error", reject);
		});
	}

	async injectAnnotationOverlay(paneId: string): Promise<void> {
		if (this.annotationActive.has(paneId)) return;

		// Start the webhook server and set the per-pane webhook URL on the window
		// so the injection bundle can read it.
		const port = await this.startWebhookServer();
		const webhookUrl = `http://127.0.0.1:${port}/${paneId}`;
		await this.evaluateJS(
			paneId,
			`window.__supersetWebhookUrl = ${JSON.stringify(webhookUrl)}`,
		);

		const bundle = this.getAnnotationBundle();
		await this.evaluateJS(paneId, bundle);
		this.annotationActive.add(paneId);
	}

	async removeAnnotationOverlay(paneId: string): Promise<void> {
		if (!this.annotationActive.has(paneId)) return;
		try {
			await this.evaluateJS(paneId, "window.__supersetAnnotation?.destroy()");
		} catch {
			// webContents may be destroyed or navigated away
		}
		this.annotationActive.delete(paneId);
	}

	async getAnnotations(paneId: string): Promise<unknown[]> {
		try {
			const result = await this.evaluateJS(
				paneId,
				"window.__supersetAnnotation?.getAnnotations() || []",
			);
			return (result as unknown[]) ?? [];
		} catch {
			return [];
		}
	}

	isAnnotationActive(paneId: string): boolean {
		return this.annotationActive.has(paneId);
	}

	private setupWindowOpenHandler(paneId: string, webContentsId: number): void {
		const wc = webContents.fromId(webContentsId);
		if (!wc) return;

		wc.setWindowOpenHandler(({ url }) => {
			if (url && url !== "about:blank") {
				this.emit(`new-window:${paneId}`, url);
			}
			return { action: "deny" };
		});
	}

	private setupConsoleCapture(paneId: string, webContentsId: number): void {
		const wc = webContents.fromId(webContentsId);
		if (!wc) return;

		const LEVEL_MAP: Record<string, ConsoleEntry["level"]> = {
			info: "log",
			warning: "warn",
			error: "error",
			debug: "debug",
		};

		// Electron 40+: use event params object instead of deprecated positional args.
		const WEBHOOK_MARKER = "$SUPERSET_WEBHOOK$";

		const handler = (
			event: Electron.Event<Electron.WebContentsConsoleMessageEventParams>,
		) => {
			const msg = event.message;

			// The injected annotation bundle intercepts fetch() calls to our
			// webhook URL and routes the JSON body through console.log. This
			// bypasses CSP connect-src restrictions that block webview→localhost
			// fetches. Detect the marker, parse the payload, and emit events.
			if (msg.startsWith(WEBHOOK_MARKER)) {
				try {
					const data = JSON.parse(msg.slice(WEBHOOK_MARKER.length)) as {
						event: string;
						annotation?: Record<string, unknown>;
						annotations?: unknown[];
						output?: string;
						url?: string;
					};
					if (data.event === "submit" && data.output) {
						this.emit(`annotations:submitted:${paneId}`, {
							annotations: data.annotations ?? [],
							output: data.output,
							pageUrl: data.url ?? "",
						} satisfies AnnotationSubmission);
					}
					if (data.event === "annotation.add" && data.annotation) {
						this.emit(`annotation:added:${paneId}`, {
							annotation: data.annotation,
							pageUrl: data.url ?? "",
						});
					}
				} catch {
					// malformed payload — ignore
				}
				return; // don't store webhook markers in console log history
			}

			const entries = this.consoleLogs.get(paneId) ?? [];
			entries.push({
				level: LEVEL_MAP[event.level] ?? "log",
				message: msg,
				timestamp: Date.now(),
			});
			if (entries.length > MAX_CONSOLE_ENTRIES) {
				entries.splice(0, entries.length - MAX_CONSOLE_ENTRIES);
			}
			this.consoleLogs.set(paneId, entries);
			this.emit(`console:${paneId}`, entries[entries.length - 1]);
		};

		wc.on("console-message", handler);
		this.consoleListeners.set(paneId, () => {
			try {
				wc.off("console-message", handler);
			} catch {
				// webContents may be destroyed
			}
		});
	}
}

export const browserManager = new BrowserManager();
