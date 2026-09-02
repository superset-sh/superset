import { EventEmitter } from "node:events";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { clipboard, Menu, webContents } from "electron";
import { safeOpenExternal } from "main/lib/safe-url";
import type {
	DesignModeRect,
	DesignModeScreenshot,
	DesignModeSelectionResult,
} from "shared/browser-design-mode";
import { chordFromInput } from "shared/hotkey-chord";
import {
	forwardSessionFor,
	handleTargetCommand,
	shimIds,
	tagEventSession,
} from "./cdp-target-shim";
import { DesignModeController } from "./design-mode-controller";
import { captureDesignModeScreenshot } from "./design-mode-screenshot";
import { buildDesignModeScript } from "./design-mode-script";
import { markBrowserPanePopup, shouldOpenAsPopup } from "./popup-window";

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

// A hidden pane presents no compositor frames, so `capturePage` can hang
// indefinitely or fail ("UnknownVizError" / an empty bitmap). The agent wake
// makes the renderer re-park the webview presentable, and the capture
// request itself forces a frame — but on a deeply idled guest that first
// frame lands seconds later, resolving the *next* attempt instantly. So:
// bound each attempt, retry until the deadline.
const CAPTURE_DEADLINE_MS = 15_000;
const CAPTURE_ATTEMPT_TIMEOUT_MS = 1_500;
const CAPTURE_RETRY_INTERVAL_MS = 100;

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

/** Shared by panes and by the popups they open. Returns a detach function. */
function attachNavigationGuard(wc: Electron.WebContents): () => void {
	const handler = (event: Electron.Event, url: string) => {
		if (!isAllowedGuestUrl(url)) event.preventDefault();
	};
	wc.on("will-navigate", handler);
	wc.on("will-redirect", handler);
	return () => {
		try {
			wc.off("will-navigate", handler);
			wc.off("will-redirect", handler);
		} catch {
			// webContents may be destroyed
		}
	};
}

/**
 * Window options for a popup opened from a guest pane.
 *
 * Geometry is deliberately left out: Electron already parses `width`/`height`/
 * `x`/`y` from the `features` string, and options returned here outrank that
 * parse — setting them would only re-derive what Chromium worked out, and drift
 * from it. `partition` is left out for a different reason: the popup inherits
 * the opener's session, and that shared cookie jar is the point of allowing it.
 */
function popupWindowOptions(): Electron.BrowserWindowConstructorOptions {
	return {
		autoHideMenuBar: true,
		// A sign-in window has no business going fullscreen.
		fullscreenable: false,
		// `webPreferences` is deliberately not set. Electron inherits the
		// opener's security preferences and refuses to relax them, so the popup
		// is already no-Node and context-isolated. Restating them here would be
		// worse than redundant: if a value we pin ever diverges from the guest's
		// (`sandbox` especially), Electron isolates the child in its own process
		// and `window.opener` comes back null, silently breaking the one thing
		// this popup exists to preserve.
	};
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

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message: string,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err: unknown) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

class BrowserManager extends EventEmitter {
	private panes = new Map<string, PaneRegistration>();
	private consoleLogs = new Map<string, ConsoleEntry[]>();
	private consoleListeners = new Map<string, () => void>();
	private contextMenuListeners = new Map<string, () => void>();
	private beforeInputListeners = new Map<string, () => void>();
	private navigationListeners = new Map<string, () => void>();
	private popupListeners = new Map<string, () => void>();
	private cdpDetachers = new Map<string, () => void>();
	// Ref-count of in-flight agent work per pane (a live CDP session, a
	// screenshot capture). While present the guest renderer stays
	// un-throttled — see acquireAgentWake. The entry object's identity ties
	// releases to the registration generation they were acquired under.
	private agentWakes = new Map<string, { count: number }>();
	// Canonical chords to suppress in the focused guest and forward for the
	// renderer to replay. Kept override/layout-aware by the renderer.
	private forwardableChords = new Set<string>();
	private designMode = new DesignModeController();

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
				this.popupListeners,
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
			// Throttling stays enabled by default so parked/offscreen persistent
			// webviews don't run at full speed in the background — except while
			// agent work is in flight on the pane (see acquireAgentWake), where a
			// throttled+hidden guest stops presenting frames and CDP input and
			// screenshots silently break.
			this.applyThrottling(paneId, wc);
			this.setupWindowOpen(paneId, wc);
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
			this.popupListeners,
		]) {
			const cleanup = map.get(paneId);
			if (cleanup) {
				cleanup();
				map.delete(paneId);
			}
		}
		this.cdpDetachers.get(paneId)?.();
		this.designMode.cancel(paneId, "destroyed");
		this.panes.delete(paneId);
		this.consoleLogs.delete(paneId);
		// Tell subscribers when a live wake dies with the pane, so the renderer
		// doesn't keep a stale pane id in its exemption set.
		if (this.agentWakes.delete(paneId)) this.emitAgentActive();
	}

	/**
	 * Keep the pane's guest responsive while agent work is in flight (a live
	 * CDP session, an in-flight screenshot). Two halves, both required: this
	 * disables background throttling on the guest, and the `agent-active`
	 * event tells the renderer registry to park the pane's webview
	 * presentable (`opacity: 0`) instead of `visibility: hidden` — a
	 * visibility-hidden webview stops getting compositor frames entirely, so
	 * `capturePage`/`Page.captureScreenshot` hang or fail ("UnknownVizError").
	 * Ref-counted so overlapping work (a CDP session plus a screenshot)
	 * doesn't drop the wake early. Each release is bound to the wake entry it
	 * incremented: unregister() discards the entry, so a release held by
	 * work that outlived the pane (a capture can run up to 15 s) cannot
	 * decrement a wake acquired after the pane re-registered. Returns an
	 * idempotent release.
	 */
	private acquireAgentWake(paneId: string): () => void {
		let entry = this.agentWakes.get(paneId);
		if (entry) {
			entry.count += 1;
		} else {
			entry = { count: 1 };
			this.agentWakes.set(paneId, entry);
			const wc = this.getWebContents(paneId);
			if (wc) this.applyThrottling(paneId, wc);
			this.emitAgentActive();
		}
		let released = false;
		return () => {
			if (released) return;
			released = true;
			// A different (or missing) entry means the pane's wake state was
			// reset since this wake was acquired — this release is stale.
			if (this.agentWakes.get(paneId) !== entry) return;
			entry.count -= 1;
			if (entry.count <= 0) {
				this.agentWakes.delete(paneId);
				const wc = this.getWebContents(paneId);
				if (wc) this.applyThrottling(paneId, wc);
				this.emitAgentActive();
			}
		};
	}

	private applyThrottling(paneId: string, wc: Electron.WebContents): void {
		try {
			wc.setBackgroundThrottling(!this.agentWakes.has(paneId));
		} catch {
			// webContents may be destroyed
		}
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
		// Hold the wake for the whole session so input dispatch and screenshots
		// keep working while the pane's workspace is not the visible view.
		const releaseWake = this.acquireAgentWake(paneId);

		// A browser-level CDP client (browser-use, Playwright) expects one `page`
		// target to attach to, but the guest debugger answers `Target.*` with the
		// whole process's target list (webview + host app shell). The shim in
		// `cdp-target-shim` presents this pane as a single page target and maps a
		// synthetic flatten session to the debugger's root channel.
		const ids = shimIds(paneId);
		let flatSessionId: string | null = null;
		let autoAttachEmitted = false;
		const paneUrlTitle = () => {
			try {
				return { url: wc.getURL(), title: wc.getTitle() };
			} catch {
				// webContents may be mid-navigation or destroyed
				return { url: "", title: "" };
			}
		};

		let closed = false;
		const handleMessage = (
			_event: Electron.Event,
			method: string,
			params: unknown,
			sessionId?: string,
		) => {
			const outSessionId = tagEventSession(sessionId, flatSessionId);
			onMessage(
				JSON.stringify({
					method,
					params,
					...(outSessionId ? { sessionId: outSessionId } : {}),
				}),
			);
		};
		const handleDetach = (_event: Electron.Event, reason: string) => {
			cleanup();
			onDetach(reason);
		};
		// Once the webContents is destroyed, any wc.debugger touch throws
		// synchronously ("Object has been destroyed") — so every path below
		// checks isDestroyed() before reaching for it.
		const cleanup = () => {
			if (closed) return;
			closed = true;
			if (!wc.isDestroyed()) {
				wc.debugger.off("message", handleMessage);
				wc.debugger.off("detach", handleDetach);
			}
			this.cdpDetachers.delete(paneId);
			releaseWake();
		};
		wc.debugger.on("message", handleMessage);
		wc.debugger.on("detach", handleDetach);

		const detach = () => {
			cleanup();
			if (wc.isDestroyed()) return;
			try {
				wc.debugger.detach();
			} catch {
				// debugger may already be detached
			}
		};
		// The forced path (pane unregistered while a client is attached) must
		// tell the client, so it sees a clear close instead of every later
		// command failing with "No webContents for pane …".
		this.cdpDetachers.set(paneId, () => {
			const wasOpen = !closed;
			detach();
			if (wasOpen) onDetach("pane closed");
		});

		return {
			send: (rawMessage: string) => {
				if (closed) return;
				// A bridge message can arrive after the guest was torn down (pane
				// closed while an agent's CDP client was mid-session). Close the
				// session the way the forced-detach path does instead of letting
				// the synchronous destroyed-webContents throw escape the ws
				// message handler and take down the main process (DESKTOP-ZS).
				if (wc.isDestroyed()) {
					detach();
					onDetach("pane closed");
					return;
				}
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
				const reply = (result: unknown) => {
					onMessage(
						JSON.stringify({
							id,
							result,
							...(sessionId ? { sessionId } : {}),
						}),
					);
				};
				// Present this pane as a single `page` target to a browser-level
				// client, instead of the guest debugger's process-wide list.
				const { url, title } = paneUrlTitle();
				const targetRes = handleTargetCommand(method, params, {
					ids,
					url,
					title,
					flatSessionId,
					autoAttachEmitted,
				});
				if (targetRes) {
					flatSessionId = targetRes.flatSessionId;
					autoAttachEmitted = targetRes.autoAttachEmitted;
					for (const ev of targetRes.events) onMessage(JSON.stringify(ev));
					reply(targetRes.result);
					// createTarget reuses the pane as the new target, so honor the
					// requested navigation here (guarded by the scheme allowlist).
					if (targetRes.navigateTo && isAllowedGuestUrl(targetRes.navigateTo)) {
						wc.debugger
							.sendCommand("Page.navigate", { url: targetRes.navigateTo })
							.catch(() => {
								// pane may be mid-teardown; navigation is best-effort
							});
					}
					return;
				}
				// The renderer-side `Page.captureScreenshot` waits for the guest's
				// next BeginFrame, which a hidden (parked) pane may never produce —
				// the field failure mode was 2-minute hangs. `capturePage` from the
				// main process forces a frame reliably, so serve the common case
				// (default viewport capture as png/jpeg) through it. Requests
				// capturePage can't honor faithfully — `clip`, `captureBeyondViewport`
				// (puppeteer full-page), or another format — keep the native path
				// rather than silently returning the wrong image. The reply echoes
				// the client's sessionId, so flattened (shim-session) requests get a
				// correctly-tagged response too.
				const shotParams = params as
					| {
							clip?: unknown;
							captureBeyondViewport?: unknown;
							format?: unknown;
							quality?: unknown;
							fromSurface?: unknown;
							optimizeForSpeed?: unknown;
					  }
					| undefined;
				const format = shotParams?.format;
				if (
					method === "Page.captureScreenshot" &&
					shotParams?.clip == null &&
					shotParams?.captureBeyondViewport !== true &&
					shotParams?.fromSurface !== false &&
					shotParams?.optimizeForSpeed !== true &&
					(format == null || format === "png" || format === "jpeg")
				) {
					const quality = shotParams?.quality;
					this.capturePageImage(paneId)
						.then((image) => {
							if (closed) return;
							const data =
								format === "jpeg"
									? image
											.toJPEG(typeof quality === "number" ? quality : 80)
											.toString("base64")
									: image.toPNG().toString("base64");
							reply({ data });
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
				// The synthetic flatten session maps to the debugger's root
				// channel, so strip it before forwarding; the response still
				// echoes the client's original sessionId above.
				const forwardSessionId = forwardSessionFor(sessionId, flatSessionId);
				wc.debugger
					.sendCommand(method, params, forwardSessionId)
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

	/**
	 * Panes with agent work in flight (live CDP session or capture). The
	 * renderer parks these presentable and exempts them from LRU eviction.
	 */
	getAgentActivePaneIds(): string[] {
		return [...this.agentWakes.keys()];
	}

	private emitAgentActive(): void {
		this.emit("agent-active", { paneIds: this.getAgentActivePaneIds() });
	}

	navigate(paneId: string, url: string, workspaceId?: string): void {
		// Resolve first: a disallowed scheme throws here rather than silently
		// becoming a web search, so the caller gets a clear error.
		const resolved = resolveGuestUrl(url);
		const wc = this.getWebContents(paneId, workspaceId);
		if (!wc) throw new Error(`No webContents for pane ${paneId}`);
		wc.loadURL(resolved);
	}

	async screenshot(
		paneId: string,
	): Promise<{ image: Electron.NativeImage; url: string }> {
		const image = await this.capturePageImage(paneId);
		clipboard.writeImage(image);
		const wc = this.getWebContents(paneId);
		return { image, url: wc?.getURL() ?? "" };
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
		// Transient wake: a hidden pane presents no frames, so an un-waked
		// capture hangs or fails with "UnknownVizError".
		const releaseWake = this.acquireAgentWake(paneId);
		try {
			const deadline = Date.now() + CAPTURE_DEADLINE_MS;
			let lastError: unknown = null;
			do {
				try {
					// An abandoned attempt is not wasted: its copy request still
					// forces a frame, which the next attempt captures instantly.
					const image = await withTimeout(
						wc.capturePage(),
						CAPTURE_ATTEMPT_TIMEOUT_MS,
						`Screenshot attempt for pane ${paneId} timed out`,
					);
					if (!image.isEmpty()) return image;
					lastError = new Error(
						`Captured an empty image for pane ${paneId} — its renderer produced no frame`,
					);
				} catch (err) {
					lastError = err;
				}
				await new Promise((resolve) =>
					setTimeout(resolve, CAPTURE_RETRY_INTERVAL_MS),
				);
			} while (Date.now() < deadline);
			throw lastError instanceof Error
				? lastError
				: new Error(`Screenshot failed for pane ${paneId}`);
		} finally {
			releaseWake();
		}
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

	/**
	 * Enable/disable design mode on a pane. Enabling injects the element-picker
	 * overlay into the guest; disabling cancels any in-flight selection and
	 * tears the overlay down. Re-injection is idempotent.
	 */
	async setDesignMode(paneId: string, enabled: boolean): Promise<boolean> {
		const wc = this.getWebContents(paneId);
		if (!wc) return false;
		if (!enabled) {
			const hadActiveOp = this.designMode.hasActiveOp(paneId);
			this.designMode.cancel(paneId, "user");
			// Cancelling an active op already injects the teardown; only a bare
			// overlay (selection settled, composer showing) still needs one.
			if (hadActiveOp) return true;
			try {
				await wc.executeJavaScript(buildDesignModeScript("teardown"));
				return true;
			} catch {
				return false;
			}
		}
		try {
			await wc.executeJavaScript(buildDesignModeScript("arm"));
			return true;
		} catch {
			return false;
		}
	}

	/** Await one design-mode element selection; resolves exactly once. */
	awaitDesignSelection(
		paneId: string,
		opId: string,
	): Promise<DesignModeSelectionResult> {
		const wc = this.getWebContents(paneId);
		if (!wc) {
			return Promise.resolve({
				opId,
				kind: "error",
				reason: `No webContents for pane ${paneId}`,
			});
		}
		return this.designMode.awaitSelection(paneId, opId, wc);
	}

	cancelDesignSelection(paneId: string): void {
		this.designMode.cancel(paneId, "user");
	}

	/** Screenshot of the guest cropped to a selected element's viewport rect. */
	async captureDesignScreenshot(
		paneId: string,
		rect: DesignModeRect,
	): Promise<DesignModeScreenshot | null> {
		const wc = this.getWebContents(paneId);
		if (!wc) return null;
		// capturePageImage brings the agent wake + per-attempt timeout + retry —
		// a bare capturePage() hangs on a pane that goes hidden mid-capture.
		return captureDesignModeScreenshot(rect, wc, () =>
			this.capturePageImage(paneId),
		);
	}

	openDevTools(paneId: string): void {
		const wc = this.getWebContents(paneId);
		if (!wc) return;
		wc.openDevTools({ mode: "detach" });
	}

	/**
	 * Emulate a fixed device viewport (Chrome's "device toolbar"), or clear the
	 * emulation when `params` is null. Device metrics live on the main-process
	 * `WebContents`, not the renderer-side `<webview>` tag, so this is the one
	 * viewport control that can't be done directly from the registry.
	 */
	setDeviceEmulation(
		paneId: string,
		params: { width: number; height: number } | null,
	): void {
		const wc = this.getWebContents(paneId);
		if (!wc) return;
		if (!params) {
			wc.disableDeviceEmulation();
			return;
		}
		wc.enableDeviceEmulation({
			screenPosition: "mobile",
			screenSize: { width: params.width, height: params.height },
			viewPosition: { x: 0, y: 0 },
			deviceScaleFactor: 0,
			viewSize: { width: params.width, height: params.height },
			scale: 1,
		});
	}

	// Block navigations to disallowed schemes (file:, chrome:, devtools:, …) on
	// the guest itself, so the policy holds whether the load came from the
	// toolbar, a link, or a raw CDP `Page.navigate` (which skips sanitizeUrl).
	private setupNavigationGuard(paneId: string, wc: Electron.WebContents): void {
		this.navigationListeners.set(paneId, attachNavigationGuard(wc));
	}

	private setupWindowOpen(paneId: string, wc: Electron.WebContents): void {
		wc.setWindowOpenHandler((details) =>
			this.resolveWindowOpen(paneId, details),
		);
		const onCreated = (window: Electron.BrowserWindow) => {
			this.configurePopupWindow(paneId, window);
		};
		wc.on("did-create-window", onCreated);
		this.popupListeners.set(paneId, () => {
			try {
				wc.off("did-create-window", onCreated);
			} catch {
				// webContents may be destroyed
			}
		});
	}

	/**
	 * Decide what a guest's `window.open` should do.
	 *
	 * A `target="_blank"` link (a tab disposition) keeps the pane behaviour: deny
	 * the native window and let the renderer open the URL as a split. The one
	 * exception is an OAuth authorization URL, which arrives with the same
	 * disposition when a site opens sign-in via a bare `window.open(url)` but
	 * cannot survive losing its opener — see `shouldOpenAsPopup`.
	 *
	 * A real popup has to stay a real popup. `window.open(url, name, "width=…")`
	 * is how "Sign in with Google" flows work (Firebase `signInWithPopup`, Google
	 * Identity Services, Auth0): the popup hands its result back through
	 * `window.opener` and then closes itself. Re-opening that URL as a detached
	 * pane drops both the opener and the window name, so the flow can never
	 * complete — the reported symptom is Google bouncing the callback to
	 * `accounts.google.com/CookieMismatch` (SUPER-1272). Allowing the window also
	 * keeps it on the opener's session, so it shares the pane's cookie jar.
	 */
	private resolveWindowOpen(
		paneId: string,
		details: Electron.HandlerDetails,
	): Electron.WindowOpenHandlerResponse {
		if (!isAllowedGuestUrl(details.url)) return { action: "deny" };
		if (shouldOpenAsPopup(details)) {
			return {
				action: "allow",
				// The default, but worth stating: a sign-in popup must not
				// outlive the page that opened it.
				outlivesOpener: false,
				overrideBrowserWindowOptions: popupWindowOptions(),
			};
		}
		this.emit(`new-window:${paneId}`, details.url);
		return { action: "deny" };
	}

	/**
	 * A popup loads arbitrary web content in the pane's session, so it gets the
	 * pane's scheme guard, and the same window-open policy so the nested consent
	 * window Google opens mid-flow stays a popup too.
	 */
	private configurePopupWindow(
		paneId: string,
		window: Electron.BrowserWindow,
	): void {
		const wc = window.webContents;
		markBrowserPanePopup(wc);
		const detachGuard = attachNavigationGuard(wc);
		wc.setWindowOpenHandler((details) =>
			this.resolveWindowOpen(paneId, details),
		);
		wc.on("did-create-window", (child) => {
			this.configurePopupWindow(paneId, child);
		});
		window.on("closed", detachGuard);
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
						label: i18n._(
							msg({
								message: "Open Link in Default Browser",
							}),
						),
						click: () => {
							void safeOpenExternal(linkURL);
						},
					},
					{
						label: i18n._(
							msg({
								message: "Open Link as New Split",
							}),
						),
						click: () =>
							this.emit(`context-menu-action:${paneId}`, {
								action: "open-in-split" as const,
								url: linkURL,
							}),
					},
					{
						label: i18n._(
							msg({
								message: "Copy Link Address",
							}),
						),
						click: () => clipboard.writeText(linkURL),
					},
					{ type: "separator" },
				);
			}

			if (selectionText) {
				menuItems.push({
					label: i18n._(
						msg({
							message: "Copy",
						}),
					),
					enabled: editFlags.canCopy,
					click: () => wc.copy(),
				});
			}

			if (editFlags.canPaste) {
				menuItems.push({
					label: i18n._(
						msg({
							message: "Paste",
						}),
					),
					click: () => wc.paste(),
				});
			}

			if (editFlags.canSelectAll) {
				menuItems.push({
					label: i18n._(
						msg({
							message: "Select All",
						}),
					),
					click: () => wc.selectAll(),
				});
			}

			if (selectionText || editFlags.canPaste || editFlags.canSelectAll) {
				menuItems.push({ type: "separator" });
			}

			menuItems.push(
				{
					label: i18n._(
						msg({
							message: "Back",
						}),
					),
					enabled: wc.canGoBack(),
					click: () => wc.goBack(),
				},
				{
					label: i18n._(
						msg({
							message: "Forward",
						}),
					),
					enabled: wc.canGoForward(),
					click: () => wc.goForward(),
				},
				{
					label: i18n._(
						msg({
							message: "Reload",
						}),
					),
					click: () => wc.reload(),
				},
			);

			if (!linkURL) {
				menuItems.push(
					{ type: "separator" },
					{
						label: i18n._(
							msg({
								message: "Open Page in Default Browser",
							}),
						),
						click: () => {
							if (pageURL && pageURL !== "about:blank") {
								void safeOpenExternal(pageURL);
							}
						},
						enabled: !!pageURL && pageURL !== "about:blank",
					},
					{
						label: i18n._(
							msg({
								message: "Copy Page URL",
							}),
						),
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
