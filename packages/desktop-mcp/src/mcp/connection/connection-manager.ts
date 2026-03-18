import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { ConsoleCapture } from "../console-capture/index.js";
import { FocusLock } from "../focus-lock/index.js";

/**
 * Resolves the CDP endpoint to connect to.
 *
 * When DESKTOP_AUTOMATION_PORT is set, connects directly to that port.
 * Otherwise, throws — the desktop app must have CDP explicitly enabled
 * via DESKTOP_AUTOMATION_ENABLED=true (which sets the port).
 */
function getCdpPort(): number {
	const port = Number(process.env.DESKTOP_AUTOMATION_PORT);
	if (!port || Number.isNaN(port)) {
		throw new Error(
			"[desktop-mcp] DESKTOP_AUTOMATION_PORT is not set. " +
				"Launch the desktop app with DESKTOP_AUTOMATION_ENABLED=true " +
				"and DESKTOP_AUTOMATION_PORT=<port> to enable CDP.",
		);
	}
	return port;
}

/**
 * Manages a CDP connection to the Electron renderer via puppeteer-core.
 *
 * - Lazy connect on first tool call (Electron might not be running yet)
 * - Auto-reconnect if connection drops (Electron restart/hot reload)
 * - Re-injects focus lock and console capture on reconnect
 */
export class ConnectionManager {
	private browser: Browser | null = null;
	private page: Page | null = null;

	readonly consoleCapture = new ConsoleCapture();
	readonly focusLock = new FocusLock();

	async getPage(): Promise<Page> {
		if (this.page && this.browser?.connected) {
			await this.focusLock.inject(this.page);
			return this.page;
		}
		return this.connect();
	}

	private async connect(): Promise<Page> {
		const cdpPort = getCdpPort();
		this.browser = await puppeteer.connect({
			browserURL: `http://127.0.0.1:${cdpPort}`,
			protocolTimeout: 60_000,
			defaultViewport: null,
		});
		const pages = await this.browser.pages();

		// Find the main Electron renderer page.
		// With browser pane <webview> tags, CDP exposes multiple "page"
		// targets. The renderer is the one loaded from Vite (localhost) in dev
		// or from a local file in production. Browser pane webviews will have
		// arbitrary user URLs (or about:blank).
		const appPage = pages.find((p) => {
			const url = p.url();
			return url.startsWith("http://localhost:") || url.startsWith("file://");
		});
		if (!appPage) {
			throw new Error(
				`[desktop-mcp] No app pages found via CDP (found ${pages.length} pages: ${pages.map((p) => p.url()).join(", ")})`,
			);
		}
		this.page = appPage;

		this.consoleCapture.attach(this.page);
		this.focusLock.attach(this.page);
		await this.focusLock.inject(this.page);

		this.browser.on("disconnected", () => {
			this.browser = null;
			this.page = null;
		});

		return this.page;
	}
}
