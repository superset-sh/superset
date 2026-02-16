import { EventEmitter } from "node:events";
import {
	app,
	type BrowserWindow,
	clipboard,
	session,
	WebContentsView,
} from "electron";
import type { NavigationEvent } from "shared/browser-types";

interface ConsoleEntry {
	level: "log" | "warn" | "error" | "info" | "debug";
	message: string;
	timestamp: number;
}

interface BrowserViewEntry {
	view: WebContentsView;
	bounds: Electron.Rectangle;
	visible: boolean;
}

const MAX_CONSOLE_ENTRIES = 500;

class BrowserManager extends EventEmitter {
	private views = new Map<string, BrowserViewEntry>();
	private consoleLogs = new Map<string, ConsoleEntry[]>();
	private consoleListeners = new Map<string, () => void>();
	private getWindow: (() => BrowserWindow | null) | null = null;

	init(getWindow: () => BrowserWindow | null): void {
		this.getWindow = getWindow;
	}

	create(paneId: string, initialUrl: string): number {
		const existing = this.views.get(paneId);
		if (existing) {
			return existing.view.webContents.id;
		}

		const view = new WebContentsView({
			webPreferences: {
				session: session.fromPartition("persist:superset"),
			},
		});

		const entry: BrowserViewEntry = {
			view,
			bounds: { x: 0, y: 0, width: 0, height: 0 },
			visible: false,
		};
		this.views.set(paneId, entry);

		const wc = view.webContents;

		this.setupNavigationEvents(paneId, wc);
		this.setupConsoleCapture(paneId, wc);
		this.setupWindowOpenHandler(paneId, wc);

		const finalUrl = this.sanitizeUrl(initialUrl);
		wc.loadURL(finalUrl);

		return wc.id;
	}

	destroy(paneId: string): void {
		const entry = this.views.get(paneId);
		if (!entry) return;

		// Remove from window if visible
		if (entry.visible) {
			const window = this.getWindow?.();
			if (window && !window.isDestroyed()) {
				window.contentView.removeChildView(entry.view);
			}
		}

		// Clean up console listener
		const cleanup = this.consoleListeners.get(paneId);
		if (cleanup) {
			cleanup();
			this.consoleListeners.delete(paneId);
		}

		// Destroy webContents
		try {
			entry.view.webContents.close();
		} catch {
			// webContents may already be destroyed
		}

		this.views.delete(paneId);
		this.consoleLogs.delete(paneId);
	}

	destroyAll(): void {
		for (const paneId of [...this.views.keys()]) {
			this.destroy(paneId);
		}
	}

	setBounds(paneId: string, bounds: Electron.Rectangle): void {
		const entry = this.views.get(paneId);
		if (!entry) return;

		entry.bounds = bounds;
		entry.view.setBounds(bounds);
	}

	show(paneId: string): void {
		const entry = this.views.get(paneId);
		if (!entry || entry.visible) return;

		const window = this.getWindow?.();
		if (!window || window.isDestroyed()) return;

		window.contentView.addChildView(entry.view);
		entry.view.setBounds(entry.bounds);
		entry.visible = true;
	}

	hide(paneId: string): void {
		const entry = this.views.get(paneId);
		if (!entry || !entry.visible) return;

		const window = this.getWindow?.();
		if (!window || window.isDestroyed()) return;

		window.contentView.removeChildView(entry.view);
		entry.visible = false;
	}

	navigate(paneId: string, url: string): void {
		const entry = this.views.get(paneId);
		if (!entry) throw new Error(`No view for pane ${paneId}`);

		const finalUrl = this.sanitizeUrl(url);
		entry.view.webContents.loadURL(finalUrl);
	}

	getWebContents(paneId: string): Electron.WebContents | null {
		const entry = this.views.get(paneId);
		return entry?.view.webContents ?? null;
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

		const targetUrl = wc.getURL();

		try {
			const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
			const targets = (await res.json()) as Array<{
				id: string;
				url: string;
				type: string;
				webSocketDebuggerUrl?: string;
			}>;

			const target = targets.find(
				(t) => t.type === "page" && t.url === targetUrl,
			);
			if (!target) return null;

			return `http://127.0.0.1:${cdpPort}/devtools/inspector.html?ws=127.0.0.1:${cdpPort}/devtools/page/${target.id}`;
		} catch {
			return null;
		}
	}

	private sanitizeUrl(url: string): string {
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

	private setupNavigationEvents(
		paneId: string,
		wc: Electron.WebContents,
	): void {
		wc.on("did-start-loading", () => {
			this.emit(`navigation:${paneId}`, {
				type: "did-start-loading",
			} satisfies NavigationEvent);
		});

		wc.on("did-stop-loading", () => {
			this.emit(`navigation:${paneId}`, {
				type: "did-stop-loading",
				url: wc.getURL(),
				title: wc.getTitle(),
			} satisfies NavigationEvent);
		});

		wc.on("did-navigate", (_event, url) => {
			this.emit(`navigation:${paneId}`, {
				type: "did-navigate",
				url,
				title: wc.getTitle(),
			} satisfies NavigationEvent);
		});

		wc.on("did-navigate-in-page", (_event, url) => {
			this.emit(`navigation:${paneId}`, {
				type: "did-navigate-in-page",
				url,
				title: wc.getTitle(),
			} satisfies NavigationEvent);
		});

		wc.on("page-title-updated", (_event, title) => {
			this.emit(`navigation:${paneId}`, {
				type: "page-title-updated",
				title,
				url: wc.getURL(),
			} satisfies NavigationEvent);
		});

		wc.on("page-favicon-updated", (_event, favicons) => {
			this.emit(`navigation:${paneId}`, {
				type: "page-favicon-updated",
				favicons,
				url: wc.getURL(),
			} satisfies NavigationEvent);
		});

		wc.on(
			"did-fail-load",
			(_event, errorCode, errorDescription, validatedURL) => {
				this.emit(`navigation:${paneId}`, {
					type: "did-fail-load",
					errorCode,
					errorDescription,
					validatedURL,
				} satisfies NavigationEvent);
			},
		);
	}

	private setupWindowOpenHandler(
		paneId: string,
		wc: Electron.WebContents,
	): void {
		wc.setWindowOpenHandler(({ url }) => {
			if (url && url !== "about:blank") {
				this.emit(`new-window:${paneId}`, url);
			}
			return { action: "deny" };
		});
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
