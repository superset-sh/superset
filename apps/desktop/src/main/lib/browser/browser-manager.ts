import { EventEmitter } from "node:events";
import { app, clipboard, webContents } from "electron";

interface ConsoleEntry {
	level: "log" | "warn" | "error" | "info" | "debug";
	message: string;
	timestamp: number;
}

const MAX_CONSOLE_ENTRIES = 500;

function sanitizeUrl(url: string): string {
	if (/^https?:\/\//i.test(url) || url.startsWith("about:")) {
		return url;
	}
	if (url.startsWith("localhost") || url.startsWith("127.0.0.1")) {
		return `http://${url}`;
	}
	if (url.includes(".")) {
		return `https://${url}`;
	}
	return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
}

class BrowserManager extends EventEmitter {
	private paneWebContentsIds = new Map<string, number>();
	private consoleLogs = new Map<string, ConsoleEntry[]>();
	private consoleListeners = new Map<string, () => void>();

	register(paneId: string, webContentsId: number): void {
		// Clean up previous console listener if re-registering with a new webContentsId
		const prevId = this.paneWebContentsIds.get(paneId);
		if (prevId != null && prevId !== webContentsId) {
			const cleanup = this.consoleListeners.get(paneId);
			if (cleanup) {
				cleanup();
				this.consoleListeners.delete(paneId);
			}
		}
		this.paneWebContentsIds.set(paneId, webContentsId);
		const wc = webContents.fromId(webContentsId);
		if (wc) {
			wc.setBackgroundThrottling(false);
			wc.setWindowOpenHandler(({ url }) => {
				if (url && url !== "about:blank") {
					this.emit(`new-window:${paneId}`, url);
				}
				return { action: "deny" as const };
			});
			this.setupConsoleCapture(paneId, wc);
		}
	}

	unregister(paneId: string): void {
		const cleanup = this.consoleListeners.get(paneId);
		if (cleanup) {
			cleanup();
			this.consoleListeners.delete(paneId);
		}
		this.paneWebContentsIds.delete(paneId);
		this.consoleLogs.delete(paneId);
	}

	unregisterAll(): void {
		for (const paneId of [...this.paneWebContentsIds.keys()]) {
			this.unregister(paneId);
		}
	}

	getWebContents(paneId: string): Electron.WebContents | null {
		const id = this.paneWebContentsIds.get(paneId);
		if (id == null) return null;
		const wc = webContents.fromId(id);
		if (!wc || wc.isDestroyed()) return null;
		return wc;
	}

	navigate(paneId: string, url: string): void {
		const wc = this.getWebContents(paneId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		wc.loadURL(sanitizeUrl(url));
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

	async getDevToolsUrl(browserPaneId: string): Promise<string | null> {
		const wc = this.getWebContents(browserPaneId);
		if (!wc) return null;

		const cdpPort = app.commandLine.getSwitchValue("remote-debugging-port");
		if (!cdpPort) return null;

		try {
			const targetUrl = wc.getURL();
			const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
			const targets = (await res.json()) as Array<{
				id: string;
				url: string;
				type: string;
				webSocketDebuggerUrl?: string;
			}>;

			const webviewTargets = targets.filter(
				(t) => t.type === "page" || t.type === "webview",
			);

			// Strategy 1: Exact URL match
			let target = webviewTargets.find((t) => t.url === targetUrl);

			// Strategy 2: Match ignoring trailing slash / fragment differences
			if (!target && targetUrl) {
				const normalize = (u: string) =>
					u.replace(/\/?(#.*)?$/, "").toLowerCase();
				const normalizedTarget = normalize(targetUrl);
				target = webviewTargets.find(
					(t) => normalize(t.url) === normalizedTarget,
				);
			}

			// Strategy 3: If only one webview target exists, use it
			if (!target) {
				const webviewOnly = webviewTargets.filter((t) => t.type === "webview");
				if (webviewOnly.length === 1) {
					target = webviewOnly[0];
				}
			}

			if (!target) return null;

			return `http://127.0.0.1:${cdpPort}/devtools/inspector.html?ws=127.0.0.1:${cdpPort}/devtools/page/${target.id}`;
		} catch {
			return null;
		}
	}

	private setupConsoleCapture(paneId: string, wc: Electron.WebContents): void {
		const LEVEL_MAP: Record<number, ConsoleEntry["level"]> = {
			0: "log",
			1: "warn",
			2: "error",
			3: "info",
		};

		const handler = (
			_event: Electron.Event,
			level: number,
			message: string,
		) => {
			const entries = this.consoleLogs.get(paneId) ?? [];
			entries.push({
				level: LEVEL_MAP[level] ?? "log",
				message,
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
