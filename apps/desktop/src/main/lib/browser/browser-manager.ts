import { EventEmitter } from "node:events";
import { clipboard, Menu, webContents } from "electron";
import { safeOpenExternal } from "main/lib/safe-url";
import { chordFromInput } from "shared/hotkey-chord";

interface ConsoleEntry {
	level: "log" | "warn" | "error" | "info" | "debug";
	message: string;
	timestamp: number;
}

interface PaneRegistration {
	webContentsId: number;
	/** Null for panes registered by surfaces that predate workspace scoping (v1). */
	workspaceId: string | null;
}

export interface BrowserPaneInfo {
	paneId: string;
	workspaceId: string | null;
	url: string;
	title: string;
	isLoading: boolean;
}

export interface BrowserOpenRequest {
	workspaceId: string;
	url: string;
	target: "current-tab" | "new-tab";
	requestId: string;
}

export interface CdpSession {
	send: (rawMessage: string) => void;
	detach: () => void;
}

export interface ForwardedKey {
	key: string;
	code: string;
	meta: boolean;
	control: boolean;
	alt: boolean;
	shift: boolean;
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

// Schemes a guest pane may navigate to. Enforced on `will-navigate` so it holds
// no matter who initiates the load — the toolbar, a link, or a raw CDP
// `Page.navigate` (which bypasses `sanitizeUrl`). Blocks `file:`/`chrome:`/
// `devtools:`/etc. so an agent can't read local files or internal pages through
// the pane.
const ALLOWED_GUEST_SCHEMES = new Set(["http:", "https:", "about:"]);

function isAllowedGuestUrl(url: string): boolean {
	try {
		return ALLOWED_GUEST_SCHEMES.has(new URL(url).protocol);
	} catch {
		return false;
	}
}

/**
 * Resolve address-bar input to a URL the guest may load, or throw if it names
 * an explicit disallowed scheme (`file:`, `chrome:`, `data:`, `javascript:`,
 * …). Bare input keeps the address-bar heuristic (`sanitizeUrl`: host[:port] →
 * http, a dotted token → https, anything else → web search) — only an explicit
 * unsupported scheme is rejected, so a programmatic caller gets a clear error
 * instead of silently landing on a search page.
 */
export function resolveGuestUrl(input: string): string {
	const trimmed = input.trim();
	const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
	if (schemeMatch) {
		const scheme = `${(schemeMatch[1] as string).toLowerCase()}:`;
		const rest = trimmed.slice((schemeMatch[0] as string).length);
		// Tell a real scheme ("file:///…", "data:…") apart from a bare host:port
		// ("localhost:3000"), where the "scheme" is a hostname and the rest is a
		// port — only the former should be scheme-checked.
		const looksLikeHostPort = /^\d+(?:[/?#]|$)/.test(rest);
		if (!looksLikeHostPort && !ALLOWED_GUEST_SCHEMES.has(scheme)) {
			throw new Error(
				`Refusing to open a ${scheme} URL in the browser pane. Only http, https, and about: URLs are allowed.`,
			);
		}
	}
	return sanitizeUrl(trimmed);
}

/** Thrown when a pane already has a live CDP session (a single one is allowed). */
export class CdpBusyError extends Error {}

class BrowserManager extends EventEmitter {
	private panes = new Map<string, PaneRegistration>();
	private consoleLogs = new Map<string, ConsoleEntry[]>();
	private consoleListeners = new Map<string, () => void>();
	private contextMenuListeners = new Map<string, () => void>();
	private beforeInputListeners = new Map<string, () => void>();
	private navigationListeners = new Map<string, () => void>();
	private cdpDetachers = new Map<string, () => void>();
	// Canonical chords to suppress in the focused guest and forward for the
	// renderer to replay. Kept override/layout-aware by the renderer.
	private forwardableChords = new Set<string>();

	setForwardableChords(chords: string[]): void {
		this.forwardableChords = new Set(chords);
	}

	register(paneId: string, webContentsId: number, workspaceId?: string): void {
		// Clean even when prevId === webContentsId so BrowserManager owns
		// listener idempotency; callers can re-register without duplicating.
		const prev = this.panes.get(paneId);
		if (prev != null) {
			for (const map of [
				this.consoleListeners,
				this.contextMenuListeners,
				this.beforeInputListeners,
				this.navigationListeners,
			]) {
				const cleanup = map.get(paneId);
				if (cleanup) {
					cleanup();
					map.delete(paneId);
				}
			}
		}
		this.panes.set(paneId, {
			webContentsId,
			workspaceId: workspaceId ?? prev?.workspaceId ?? null,
		});
		const wc = webContents.fromId(webContentsId);
		if (wc) {
			// Keep throttling enabled so parked/offscreen persistent webviews don't
			// run at full speed in the background.
			wc.setBackgroundThrottling(true);
			wc.setWindowOpenHandler(({ url }) => {
				if (url && url !== "about:blank") {
					this.emit(`new-window:${paneId}`, url);
				}
				return { action: "deny" as const };
			});
			this.setupConsoleCapture(paneId, wc);
			this.setupContextMenu(paneId, wc);
			this.setupBeforeInput(paneId, wc);
			this.setupNavigationGuard(paneId, wc);
		}
		this.emit("pane-registered", {
			paneId,
			workspaceId: workspaceId ?? prev?.workspaceId ?? null,
		});
	}

	unregister(paneId: string): void {
		for (const map of [
			this.consoleListeners,
			this.contextMenuListeners,
			this.beforeInputListeners,
			this.navigationListeners,
		]) {
			const cleanup = map.get(paneId);
			if (cleanup) {
				cleanup();
				map.delete(paneId);
			}
		}
		this.cdpDetachers.get(paneId)?.();
		this.panes.delete(paneId);
		this.consoleLogs.delete(paneId);
	}

	unregisterAll(): void {
		for (const paneId of [...this.panes.keys()]) {
			this.unregister(paneId);
		}
	}

	/**
	 * Resolve a pane's live webContents. When `workspaceId` is passed (every
	 * external/bridge caller does), the pane must belong to that workspace or
	 * this returns null — so an agent authenticated for one workspace can't
	 * reach another workspace's (or org's) panes by guessing a pane id. The
	 * renderer IPC path omits it: it only ever touches its own pane.
	 */
	getWebContents(
		paneId: string,
		workspaceId?: string,
	): Electron.WebContents | null {
		const reg = this.panes.get(paneId);
		if (!reg) return null;
		if (workspaceId != null && reg.workspaceId !== workspaceId) return null;
		const wc = webContents.fromId(reg.webContentsId);
		if (!wc || wc.isDestroyed()) return null;
		return wc;
	}

	/** Live panes (dead webContents are skipped), optionally workspace-scoped. */
	listPanes(workspaceId?: string): BrowserPaneInfo[] {
		const panes: BrowserPaneInfo[] = [];
		for (const [paneId, reg] of this.panes) {
			if (workspaceId && reg.workspaceId !== workspaceId) continue;
			const wc = this.getWebContents(paneId);
			if (!wc) continue;
			panes.push({
				paneId,
				workspaceId: reg.workspaceId,
				url: wc.getURL(),
				title: wc.getTitle(),
				isLoading: wc.isLoading(),
			});
		}
		return panes;
	}

	/**
	 * Ask the renderer to open a URL in a workspace's browser pane. Consumed by
	 * the `browser.onOpenRequest` subscription; the resulting pane announces
	 * itself back through a `pane-registered` event.
	 */
	requestOpen(request: BrowserOpenRequest): void {
		this.emit("open-request", request);
	}

	/**
	 * Attach a raw CDP session to the pane's guest webContents. One session per
	 * pane: the platform allows a single debugger per webContents, so a second
	 * attach throws until the first detaches.
	 */
	attachCdp(
		paneId: string,
		workspaceId: string,
		onMessage: (payload: string) => void,
		onDetach: (reason: string) => void,
	): CdpSession {
		const wc = this.getWebContents(paneId, workspaceId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		if (this.cdpDetachers.has(paneId)) {
			throw new CdpBusyError(
				`A CDP session is already attached to pane ${paneId}`,
			);
		}
		wc.debugger.attach("1.3");

		let closed = false;
		const handleMessage = (
			_event: Electron.Event,
			method: string,
			params: unknown,
			sessionId?: string,
		) => {
			onMessage(
				JSON.stringify({
					method,
					params,
					...(sessionId ? { sessionId } : {}),
				}),
			);
		};
		const handleDetach = (_event: Electron.Event, reason: string) => {
			cleanup();
			onDetach(reason);
		};
		const cleanup = () => {
			if (closed) return;
			closed = true;
			wc.debugger.off("message", handleMessage);
			wc.debugger.off("detach", handleDetach);
			this.cdpDetachers.delete(paneId);
		};
		wc.debugger.on("message", handleMessage);
		wc.debugger.on("detach", handleDetach);

		const detach = () => {
			cleanup();
			try {
				wc.debugger.detach();
			} catch {
				// webContents may be destroyed
			}
		};
		this.cdpDetachers.set(paneId, detach);

		return {
			send: (rawMessage: string) => {
				let parsed: {
					id?: number;
					method?: string;
					params?: unknown;
					sessionId?: string;
				};
				try {
					parsed = JSON.parse(rawMessage);
				} catch {
					onMessage(
						JSON.stringify({
							error: { code: -32700, message: "Invalid JSON" },
						}),
					);
					return;
				}
				const { id, method, params, sessionId } = parsed;
				if (typeof method !== "string") {
					onMessage(
						JSON.stringify({
							id,
							error: { code: -32600, message: "Missing method" },
							...(sessionId ? { sessionId } : {}),
						}),
					);
					return;
				}
				// `will-navigate` doesn't fire for CDP-initiated navigations, so the
				// scheme allowlist is re-checked here — otherwise `Page.navigate`
				// could point the guest at file:// / chrome:// and read it back.
				if (method === "Page.navigate") {
					const navUrl = (params as { url?: unknown } | undefined)?.url;
					if (typeof navUrl === "string" && !isAllowedGuestUrl(navUrl)) {
						onMessage(
							JSON.stringify({
								id,
								error: {
									code: -32000,
									message: `Navigation to ${navUrl} is not allowed`,
								},
								...(sessionId ? { sessionId } : {}),
							}),
						);
						return;
					}
				}
				wc.debugger
					.sendCommand(method, params, sessionId)
					.then((result) => {
						if (closed) return;
						onMessage(
							JSON.stringify({
								id,
								result: result ?? {},
								...(sessionId ? { sessionId } : {}),
							}),
						);
					})
					.catch((err: unknown) => {
						if (closed) return;
						onMessage(
							JSON.stringify({
								id,
								error: {
									code: -32000,
									message: err instanceof Error ? err.message : String(err),
								},
								...(sessionId ? { sessionId } : {}),
							}),
						);
					});
			},
			detach,
		};
	}

	navigate(paneId: string, url: string, workspaceId?: string): void {
		// Resolve first: a disallowed scheme throws here rather than silently
		// becoming a web search, so the caller gets a clear error.
		const resolved = resolveGuestUrl(url);
		const wc = this.getWebContents(paneId, workspaceId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		wc.loadURL(resolved);
	}

	async screenshot(paneId: string): Promise<string> {
		const image = await this.capturePageImage(paneId);
		clipboard.writeImage(image);
		return image.toPNG().toString("base64");
	}

	/** Screenshot for programmatic callers — must not clobber the clipboard. */
	async capturePng(paneId: string, workspaceId?: string): Promise<string> {
		const image = await this.capturePageImage(paneId, workspaceId);
		return image.toPNG().toString("base64");
	}

	private async capturePageImage(
		paneId: string,
		workspaceId?: string,
	): Promise<Electron.NativeImage> {
		const wc = this.getWebContents(paneId, workspaceId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		return wc.capturePage();
	}

	async evaluateJS(
		paneId: string,
		code: string,
		workspaceId?: string,
	): Promise<unknown> {
		const wc = this.getWebContents(paneId, workspaceId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		return wc.executeJavaScript(code);
	}

	getConsoleLogs(paneId: string, workspaceId?: string): ConsoleEntry[] {
		if (!this.getWebContents(paneId, workspaceId)) return [];
		return this.consoleLogs.get(paneId) ?? [];
	}

	openDevTools(paneId: string): void {
		const wc = this.getWebContents(paneId);
		if (!wc) return;
		wc.openDevTools({ mode: "detach" });
	}

	// Block navigations to disallowed schemes (file:, chrome:, devtools:, …) on
	// the guest itself, so the policy holds whether the load came from the
	// toolbar, a link, or a raw CDP `Page.navigate` (which skips sanitizeUrl).
	private setupNavigationGuard(paneId: string, wc: Electron.WebContents): void {
		const handler = (event: Electron.Event, url: string) => {
			if (!isAllowedGuestUrl(url)) event.preventDefault();
		};
		wc.on("will-navigate", handler);
		wc.on("will-redirect", handler);
		this.navigationListeners.set(paneId, () => {
			try {
				wc.off("will-navigate", handler);
				wc.off("will-redirect", handler);
			} catch {
				// webContents may be destroyed
			}
		});
	}

	private setupContextMenu(paneId: string, wc: Electron.WebContents): void {
		const handler = (
			_event: Electron.Event,
			params: Electron.ContextMenuParams,
		) => {
			const { linkURL, pageURL, selectionText, editFlags } = params;

			const menuItems: Electron.MenuItemConstructorOptions[] = [];

			if (linkURL) {
				menuItems.push(
					{
						label: "Open Link in Default Browser",
						click: () => {
							void safeOpenExternal(linkURL);
						},
					},
					{
						label: "Open Link as New Split",
						click: () =>
							this.emit(`context-menu-action:${paneId}`, {
								action: "open-in-split" as const,
								url: linkURL,
							}),
					},
					{
						label: "Copy Link Address",
						click: () => clipboard.writeText(linkURL),
					},
					{ type: "separator" },
				);
			}

			if (selectionText) {
				menuItems.push({
					label: "Copy",
					enabled: editFlags.canCopy,
					click: () => wc.copy(),
				});
			}

			if (editFlags.canPaste) {
				menuItems.push({
					label: "Paste",
					click: () => wc.paste(),
				});
			}

			if (editFlags.canSelectAll) {
				menuItems.push({
					label: "Select All",
					click: () => wc.selectAll(),
				});
			}

			if (selectionText || editFlags.canPaste || editFlags.canSelectAll) {
				menuItems.push({ type: "separator" });
			}

			menuItems.push(
				{
					label: "Back",
					enabled: wc.canGoBack(),
					click: () => wc.goBack(),
				},
				{
					label: "Forward",
					enabled: wc.canGoForward(),
					click: () => wc.goForward(),
				},
				{
					label: "Reload",
					click: () => wc.reload(),
				},
			);

			if (!linkURL) {
				menuItems.push(
					{ type: "separator" },
					{
						label: "Open Page in Default Browser",
						click: () => {
							if (pageURL && pageURL !== "about:blank") {
								void safeOpenExternal(pageURL);
							}
						},
						enabled: !!pageURL && pageURL !== "about:blank",
					},
					{
						label: "Copy Page URL",
						click: () => {
							if (pageURL) clipboard.writeText(pageURL);
						},
						enabled: !!pageURL && pageURL !== "about:blank",
					},
				);
			}

			const menu = Menu.buildFromTemplate(menuItems);
			menu.popup();
		};

		wc.on("context-menu", handler);
		this.contextMenuListeners.set(paneId, () => {
			try {
				wc.off("context-menu", handler);
			} catch {
				// webContents may be destroyed
			}
		});
	}

	// When a webview has focus, keystrokes route to the guest renderer — host
	// `react-hotkeys-hook` listeners never see them and the menu's CmdOrCtrl+W
	// accelerator closes the whole window. `before-input-event` fires in the
	// main process before both, so we intercept CmdOrCtrl+W/R and any
	// renderer-registered forwardable chord here. Everything else falls through
	// untouched, keeping in-page shortcuts (copy/paste/find/…) working.
	private setupBeforeInput(paneId: string, wc: Electron.WebContents): void {
		const handler = (event: Electron.Event, input: Electron.Input): void => {
			if (input.type !== "keyDown") return;

			if ((input.meta || input.control) && !input.shift && !input.alt) {
				const key = input.key.toLowerCase();
				if (key === "w") {
					event.preventDefault();
					this.emit(`close-pane:${paneId}`);
					return;
				}
				if (key === "r") {
					event.preventDefault();
					this.emit(`reload-pane:${paneId}`);
					return;
				}
			}

			const chord = chordFromInput(input);
			if (!chord || !this.forwardableChords.has(chord)) return;
			event.preventDefault();
			this.emit(`key-forward:${paneId}`, {
				key: input.key,
				code: input.code,
				meta: input.meta,
				control: input.control,
				alt: input.alt,
				shift: input.shift,
			} satisfies ForwardedKey);
		};

		wc.on("before-input-event", handler);
		this.beforeInputListeners.set(paneId, () => {
			try {
				wc.off("before-input-event", handler);
			} catch {
				// webContents may be destroyed
			}
		});
	}

	private setupConsoleCapture(paneId: string, wc: Electron.WebContents): void {
		// Electron's console-message `level` is 0..3 = verbose, info, warning,
		// error (per electron.d.ts). console.log fires level 1 (info), so a naive
		// 0:log,1:warn,… map mislabels every message by one.
		const LEVEL_MAP: Record<number, ConsoleEntry["level"]> = {
			0: "debug",
			1: "log",
			2: "warn",
			3: "error",
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
