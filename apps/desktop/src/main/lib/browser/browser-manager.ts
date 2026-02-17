import { EventEmitter } from "node:events";
import { app, clipboard, type WebContents, webContents } from "electron";

interface ConsoleEntry {
	level: "log" | "warn" | "error" | "info" | "debug";
	message: string;
	timestamp: number;
}

const MAX_CONSOLE_ENTRIES = 500;

class BrowserManager extends EventEmitter {
	private paneToWebContentsId = new Map<string, number>();
	private consoleLogs = new Map<string, ConsoleEntry[]>();
	private consoleListeners = new Map<string, () => void>();

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
