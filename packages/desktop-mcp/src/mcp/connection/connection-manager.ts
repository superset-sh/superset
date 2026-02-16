import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { ConsoleCapture } from "../console-capture/index.js";
import { FocusLock } from "../focus-lock/index.js";

const CDP_PORT = Number(process.env.DESKTOP_AUTOMATION_PORT) || 9223;

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
		this.browser = await puppeteer.connect({
			browserURL: `http://127.0.0.1:${CDP_PORT}`,
			protocolTimeout: 60_000,
			defaultViewport: null,
		});
		const pages = await this.browser.pages();

		// Find the actual app page, skipping chrome-extension:// background pages
		const appPage = pages.find(
			(p) => !p.url().startsWith("chrome-extension://"),
		);
		if (!appPage) {
			throw new Error(
				`[desktop-mcp] No app pages found via CDP (found ${pages.length} pages, all extensions)`,
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
