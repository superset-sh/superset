import { pointerPassthrough } from "renderer/lib/pointer-passthrough";
import { selectRuntimesToEvict } from "renderer/lib/terminal/terminal-runtime-eviction";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { BrowserLoadError } from "shared/tabs-types";
import { sanitizeUrl } from "./sanitizeUrl";

export interface BrowserRuntimeState {
	currentUrl: string;
	pageTitle: string;
	faviconUrl: string | null;
	isLoading: boolean;
	error: BrowserLoadError | null;
	canGoBack: boolean;
	canGoForward: boolean;
	/**
	 * 1 = 100%. Set through our own zoom controls (no pinch/ctrl-scroll
	 * support) and re-read from the webview after navigations — Chromium zoom
	 * is per-origin, so a navigation can land on a different actual factor.
	 */
	zoomFactor: number;
}

export interface PersistableBrowserState {
	url: string;
	pageTitle: string;
	faviconUrl: string | null;
}

interface RegistryEntry {
	webview: Electron.WebviewTag;
	/**
	 * Host layer painted directly above this pane's webview, mirroring its
	 * rect and visibility. The webview is hoisted to a body-level container,
	 * so nothing inside the pane tree can paint over it: the pane tree is its
	 * own stacking context (isolated so resize handles stay under dialogs),
	 * and z-index never crosses one. Pane UI that must cover the page (the
	 * design-mode composer, find bar, load-error and blank states) portals
	 * in here instead of competing from inside the tree.
	 */
	overlay: HTMLDivElement;
	state: BrowserRuntimeState;
	onPersist: ((state: PersistableBrowserState) => void) | null;
	/** Asks the pane to close itself; fired when the guest closes itself. */
	onClose: (() => void) | null;
	/** Owning workspace — sent on register so the main process scopes pane ops. */
	workspaceId: string;
	webContentsId: number | null;
	detachHandlers: () => void;
	placeholder: HTMLElement | null;
	resizeObserver: ResizeObserver | null;
	visible: boolean;
	/** Monotonic use counter; bumped on attach/detach, drives hidden-LRU eviction. */
	lastUsedAt: number;
}

/**
 * Cap on hidden (detached) webviews kept alive. Each one is a full guest
 * Chromium process; past the cap the least-recently-visible are destroyed
 * and rebuilt from the pane's persisted URL on next attach. (SUPER-1545)
 */
const MAX_HIDDEN_WEBVIEWS = 3;

const EMPTY_STATE: BrowserRuntimeState = Object.freeze({
	currentUrl: "about:blank",
	pageTitle: "",
	faviconUrl: null,
	isLoading: false,
	error: null,
	canGoBack: false,
	canGoForward: false,
	zoomFactor: 1,
});

const ROOT_CONTAINER_ID = "browser-runtime-root";

/** Page-zoom bounds and step for a browser pane (1 = 100%). */
export const BROWSER_ZOOM = Object.freeze({ min: 0.25, max: 5, step: 0.1 });

export type BrowserZoomDirection = "in" | "out" | "reset";

class BrowserRuntimeRegistryImpl {
	private entries = new Map<string, RegistryEntry>();
	private listenersByPaneId = new Map<string, Set<() => void>>();
	private foundInPageListenersByPaneId = new Map<
		string,
		Set<(result: Electron.FoundInPageResult) => void>
	>();
	private useSeq = 0;
	private pendingEviction: ReturnType<typeof setTimeout> | null = null;
	private rootContainer: HTMLDivElement | null = null;
	private globalListenersInstalled = false;
	// Panes an agent is driving (live CDP session or in-flight capture, fed
	// by the main process). Parked presentable instead of hidden — a
	// visibility-hidden webview gets no compositor frames, so CDP
	// screenshots hang and input hit-testing goes stale — and exempt from
	// hidden-webview eviction so the guest isn't destroyed mid-session.
	private agentActivePaneIds = new Set<string>();

	private getListeners(paneId: string): Set<() => void> {
		let set = this.listenersByPaneId.get(paneId);
		if (!set) {
			set = new Set();
			this.listenersByPaneId.set(paneId, set);
		}
		return set;
	}

	private ensureRootContainer(): HTMLDivElement {
		if (this.rootContainer?.isConnected) {
			this.installGlobalListeners();
			return this.rootContainer;
		}
		const existing = document.getElementById(
			ROOT_CONTAINER_ID,
		) as HTMLDivElement | null;
		if (existing) {
			this.rootContainer = existing;
			this.installGlobalListeners();
			return existing;
		}
		const root = document.createElement("div");
		root.id = ROOT_CONTAINER_ID;
		root.style.position = "fixed";
		root.style.top = "0";
		root.style.left = "0";
		root.style.width = "0";
		root.style.height = "0";
		root.style.pointerEvents = "none";
		root.style.zIndex = "0";
		document.body.appendChild(root);
		this.rootContainer = root;
		this.installGlobalListeners();
		return root;
	}

	constructor() {
		// Webviews are hoisted to <body>, out of reach of the stylesheet rule
		// that handles iframes, so the passthrough state is mirrored onto them.
		pointerPassthrough.subscribe((active) =>
			this.applyPointerPassthrough(active),
		);
	}

	private installGlobalListeners() {
		if (this.globalListenersInstalled) return;
		this.globalListenersInstalled = true;

		window.addEventListener("resize", () => {
			for (const entry of this.entries.values()) {
				if (entry.placeholder) this.updateLayout(entry);
			}
		});

		electronTrpcClient.browser.onAgentActivePanes.subscribe(undefined, {
			onData: ({ paneIds }: { paneIds: string[] }) => {
				this.agentActivePaneIds = new Set(paneIds);
				for (const [paneId, entry] of this.entries) {
					if (!entry.visible) this.applyParkedStyle(paneId, entry);
				}
				// A session ending can leave more hidden webviews than the cap
				// allows (they were exempt while attached) — sweep again.
				this.scheduleHiddenEviction();
			},
		});
	}

	/**
	 * Style for a parked (detached) webview. Default parking is
	 * `visibility: hidden` — cheap, the guest compositor idles. While an
	 * agent drives the pane it must stay presentable (frames keep flowing
	 * for CDP screenshots and input hit-testing), so park it transparent and
	 * click-through instead.
	 */
	private applyParkedStyle(paneId: string, entry: RegistryEntry): void {
		const style = entry.webview.style;
		if (this.agentActivePaneIds.has(paneId)) {
			style.visibility = "visible";
			style.opacity = "0";
			style.pointerEvents = "none";
		} else {
			style.visibility = "hidden";
			style.opacity = "";
		}
		entry.overlay.style.visibility = "hidden";
	}

	private applyPointerPassthrough(passthrough: boolean) {
		for (const entry of this.entries.values()) {
			if (!entry.visible) continue;
			entry.webview.style.pointerEvents = passthrough ? "none" : "auto";
		}
	}

	private updateLayout(entry: RegistryEntry) {
		if (!entry.placeholder) return;
		const rect = entry.placeholder.getBoundingClientRect();
		for (const style of [entry.webview.style, entry.overlay.style]) {
			style.top = `${rect.top}px`;
			style.left = `${rect.left}px`;
			style.width = `${rect.width}px`;
			style.height = `${rect.height}px`;
		}
	}

	/** Host layer above the pane's webview; null until the pane has attached. */
	getOverlayContainer(paneId: string): HTMLElement | null {
		return this.entries.get(paneId)?.overlay ?? null;
	}

	private notify(paneId: string) {
		const listeners = this.listenersByPaneId.get(paneId);
		if (!listeners) return;
		for (const listener of listeners) listener();
	}

	private notifyFoundInPage(
		paneId: string,
		result: Electron.FoundInPageResult,
	) {
		const listeners = this.foundInPageListenersByPaneId.get(paneId);
		if (!listeners) return;
		for (const listener of listeners) listener(result);
	}

	private setState(paneId: string, patch: Partial<BrowserRuntimeState>) {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		let changed = false;
		for (const key in patch) {
			const k = key as keyof BrowserRuntimeState;
			if (entry.state[k] !== patch[k]) {
				changed = true;
				break;
			}
		}
		if (!changed) return;
		entry.state = { ...entry.state, ...patch };
		this.notify(paneId);
	}

	private refreshNavState(paneId: string) {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		let canGoBack = false;
		let canGoForward = false;
		try {
			canGoBack = entry.webview.canGoBack();
			canGoForward = entry.webview.canGoForward();
		} catch {}
		this.setState(paneId, { canGoBack, canGoForward });
	}

	/**
	 * Chromium zoom is per-origin, not per-webview: navigating can land on an
	 * origin with a different (usually default) zoom while our state still
	 * holds the previous page's factor. Read the truth back so the menu's
	 * percentage matches what the page actually renders at.
	 */
	private refreshZoomState(paneId: string) {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		try {
			this.setState(paneId, { zoomFactor: entry.webview.getZoomFactor() });
		} catch {}
	}

	private createEntry(
		paneId: string,
		initialUrl: string,
		workspaceId: string,
	): RegistryEntry {
		const webview = document.createElement("webview") as Electron.WebviewTag;
		webview.setAttribute("partition", "persist:superset");
		webview.setAttribute("allowpopups", "");
		webview.style.position = "fixed";
		webview.style.top = "0";
		webview.style.left = "0";
		webview.style.width = "0";
		webview.style.height = "0";
		webview.style.margin = "0";
		webview.style.padding = "0";
		webview.style.border = "none";
		webview.style.visibility = "hidden";
		webview.style.pointerEvents = "auto";
		webview.src = sanitizeUrl(initialUrl);

		// Click-through by default so the page stays interactive; whatever is
		// portalled in opts back into pointer events itself. z-index 1 keeps it
		// above every webview in the container, including ones appended later.
		const overlay = document.createElement("div");
		overlay.style.position = "fixed";
		overlay.style.top = "0";
		overlay.style.left = "0";
		overlay.style.width = "0";
		overlay.style.height = "0";
		overlay.style.zIndex = "1";
		overlay.style.pointerEvents = "none";
		overlay.style.visibility = "hidden";

		const entry: RegistryEntry = {
			webview,
			overlay,
			state: { ...EMPTY_STATE, currentUrl: initialUrl },
			onPersist: null,
			onClose: null,
			workspaceId,
			webContentsId: null,
			detachHandlers: () => {},
			placeholder: null,
			resizeObserver: null,
			visible: false,
			lastUsedAt: 0,
		};

		const firePersist = () => {
			entry.onPersist?.({
				url: entry.state.currentUrl,
				pageTitle: entry.state.pageTitle,
				faviconUrl: entry.state.faviconUrl,
			});
		};

		const handleDomReady = () => {
			const webContentsId = webview.getWebContentsId();
			if (entry.webContentsId !== webContentsId) {
				entry.webContentsId = webContentsId;
				electronTrpcClient.browser.register
					.mutate({ paneId, webContentsId, workspaceId: entry.workspaceId })
					.catch((err) => {
						console.error("[browserRuntimeRegistry] register failed:", err);
					});
			}
		};

		const handleDidStartLoading = () => {
			this.setState(paneId, {
				isLoading: true,
				error: null,
				faviconUrl: null,
			});
		};

		// URL and title come from the events that carry them, never from
		// `getURL()`/`getTitle()`: those are synchronous calls into the guest,
		// and the guest can already be gone when a queued event is handled. A
		// page that calls `window.close()` is destroyed by Electron the moment
		// it asks, while the did-stop-loading it emitted first is still in
		// flight, so a read in that handler throws "Invalid guestInstanceId".
		// The title resets on each committed navigation and arrives through
		// page-title-updated, so a page with no <title> shows the pane's URL
		// fallback instead of Chromium's synthesized one.
		const handleDidStopLoading = () => {
			this.setState(paneId, { isLoading: false });
			this.refreshNavState(paneId);
			this.refreshZoomState(paneId);
			const { currentUrl, pageTitle, faviconUrl } = entry.state;
			if (currentUrl && currentUrl !== "about:blank") {
				electronTrpcClient.browserHistory.upsert
					.mutate({ url: currentUrl, title: pageTitle, faviconUrl })
					.catch((err) => {
						console.error("[browserRuntimeRegistry] upsert history:", err);
					});
			}
			firePersist();
		};

		const handleDidNavigate = (e: Electron.DidNavigateEvent) => {
			this.setState(paneId, {
				currentUrl: e.url ?? "",
				pageTitle: "",
				isLoading: false,
			});
			this.refreshNavState(paneId);
			this.refreshZoomState(paneId);
		};

		const handleDidNavigateInPage = (e: Electron.DidNavigateInPageEvent) => {
			this.setState(paneId, { currentUrl: e.url ?? "" });
			this.refreshNavState(paneId);
		};

		const handlePageTitleUpdated = (e: Electron.PageTitleUpdatedEvent) => {
			this.setState(paneId, { pageTitle: e.title ?? "" });
		};

		const handlePageFaviconUpdated = (e: Electron.PageFaviconUpdatedEvent) => {
			const favicon = e.favicons?.[0];
			if (!favicon || favicon === entry.state.faviconUrl) return;
			this.setState(paneId, { faviconUrl: favicon });
			const { currentUrl, pageTitle } = entry.state;
			if (currentUrl && currentUrl !== "about:blank") {
				electronTrpcClient.browserHistory.upsert
					.mutate({ url: currentUrl, title: pageTitle, faviconUrl: favicon })
					.catch((err) => {
						console.error("[browserRuntimeRegistry] upsert favicon:", err);
					});
			}
			firePersist();
		};

		const handleDidFailLoad = (e: Electron.DidFailLoadEvent) => {
			if (e.errorCode === -3) return; // ERR_ABORTED
			// A failed main-frame load commits Chromium's error page without a
			// did-navigate, so the address comes from the failure itself.
			this.setState(paneId, {
				isLoading: false,
				...(e.isMainFrame
					? { currentUrl: e.validatedURL ?? "", pageTitle: "" }
					: {}),
				error: {
					code: e.errorCode ?? 0,
					description: e.errorDescription ?? "",
					url: e.validatedURL ?? "",
				},
			});
		};

		const handleFoundInPage = (e: Electron.FoundInPageEvent) => {
			this.notifyFoundInPage(paneId, e.result);
		};

		// The guest webContents is gone: Electron destroys a guest whose page
		// calls `window.close()` (a sign-in flow finishing, a page closing
		// itself). The element cannot be revived — every guest method now throws
		// "Invalid guestInstanceId" — so the entry goes with it and the pane
		// closes, as a browser closes a tab whose page closed itself.
		const handleDestroyed = () => {
			if (this.entries.get(paneId) !== entry) return;
			const onClose = entry.onClose;
			this.destroy(paneId);
			onClose?.();
		};

		webview.addEventListener("dom-ready", handleDomReady);
		webview.addEventListener("did-start-loading", handleDidStartLoading);
		webview.addEventListener("did-stop-loading", handleDidStopLoading);
		webview.addEventListener(
			"did-navigate",
			handleDidNavigate as EventListener,
		);
		webview.addEventListener(
			"did-navigate-in-page",
			handleDidNavigateInPage as EventListener,
		);
		webview.addEventListener(
			"page-title-updated",
			handlePageTitleUpdated as EventListener,
		);
		webview.addEventListener(
			"page-favicon-updated",
			handlePageFaviconUpdated as EventListener,
		);
		webview.addEventListener(
			"did-fail-load",
			handleDidFailLoad as EventListener,
		);
		webview.addEventListener(
			"found-in-page",
			handleFoundInPage as EventListener,
		);
		webview.addEventListener("destroyed", handleDestroyed);

		entry.detachHandlers = () => {
			webview.removeEventListener("dom-ready", handleDomReady);
			webview.removeEventListener("did-start-loading", handleDidStartLoading);
			webview.removeEventListener("did-stop-loading", handleDidStopLoading);
			webview.removeEventListener(
				"did-navigate",
				handleDidNavigate as EventListener,
			);
			webview.removeEventListener(
				"did-navigate-in-page",
				handleDidNavigateInPage as EventListener,
			);
			webview.removeEventListener(
				"page-title-updated",
				handlePageTitleUpdated as EventListener,
			);
			webview.removeEventListener(
				"page-favicon-updated",
				handlePageFaviconUpdated as EventListener,
			);
			webview.removeEventListener(
				"did-fail-load",
				handleDidFailLoad as EventListener,
			);
			webview.removeEventListener(
				"found-in-page",
				handleFoundInPage as EventListener,
			);
			webview.removeEventListener("destroyed", handleDestroyed);
		};

		return entry;
	}

	/** Create an agent's guest without mounting or focusing its workspace route. */
	openBackground(
		paneId: string,
		url: string,
		workspaceId: string,
		onPersist: (state: PersistableBrowserState) => void,
	): void {
		if (this.entries.has(paneId)) return;
		const root = this.ensureRootContainer();
		const entry = this.createEntry(paneId, url, workspaceId);
		entry.onPersist = onPersist;
		entry.lastUsedAt = ++this.useSeq;
		// Give automation a usable viewport before this pane has ever been shown.
		entry.webview.style.width = "1280px";
		entry.webview.style.height = "720px";
		this.entries.set(paneId, entry);
		this.applyParkedStyle(paneId, entry);
		root.appendChild(entry.webview);
		root.appendChild(entry.overlay);
		this.scheduleHiddenEviction();
	}

	attach(
		paneId: string,
		placeholder: HTMLElement,
		initialUrl: string,
		workspaceId: string,
		onPersist: (state: PersistableBrowserState) => void,
		onClose: () => void,
	): void {
		const root = this.ensureRootContainer();
		let entry = this.entries.get(paneId);
		if (!entry) {
			entry = this.createEntry(paneId, initialUrl, workspaceId);
			this.entries.set(paneId, entry);
			root.appendChild(entry.webview);
			root.appendChild(entry.overlay);
		} else {
			// A reused pane can move between workspaces (the attach effect keys on
			// workspaceId). Keep the registration's workspace current so main-side
			// pane scoping addresses it under the new workspace, not the old one.
			if (entry.workspaceId !== workspaceId) {
				entry.workspaceId = workspaceId;
				if (entry.webContentsId != null) {
					electronTrpcClient.browser.register
						.mutate({
							paneId,
							webContentsId: entry.webContentsId,
							workspaceId,
						})
						.catch((err) => {
							console.error(
								"[browserRuntimeRegistry] re-register failed:",
								err,
							);
						});
				}
			}
			this.refreshNavState(paneId);
		}
		entry.onPersist = onPersist;
		entry.onClose = onClose;
		entry.placeholder = placeholder;
		entry.visible = true;
		entry.lastUsedAt = ++this.useSeq;

		entry.resizeObserver?.disconnect();
		const observer = new ResizeObserver(() => {
			if (entry) this.updateLayout(entry);
		});
		observer.observe(placeholder);
		entry.resizeObserver = observer;

		this.updateLayout(entry);
		entry.webview.style.visibility = "visible";
		entry.webview.style.opacity = "";
		entry.overlay.style.visibility = "visible";
		this.applyPointerPassthrough(pointerPassthrough.active);
	}

	detach(paneId: string): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		// Keep the persistence callback while hidden. A navigation can finish
		// after React detaches the pane; clearing it here would leave only the
		// previous URL to rebuild from if this webview is then LRU-evicted.
		entry.placeholder = null;
		entry.resizeObserver?.disconnect();
		entry.resizeObserver = null;
		entry.visible = false;
		this.applyParkedStyle(paneId, entry);
		entry.lastUsedAt = ++this.useSeq;
		this.scheduleHiddenEviction();
	}

	/** Deferred so a pane-switch (detach then attach) re-adopts before the sweep counts. */
	private scheduleHiddenEviction() {
		if (this.pendingEviction !== null) return;
		this.pendingEviction = setTimeout(() => {
			this.pendingEviction = null;
			this.evictExcessHiddenWebviews();
		}, 0);
	}

	private evictExcessHiddenWebviews() {
		const candidates = Array.from(
			this.entries.entries(),
			([paneId, entry]) => ({
				paneId,
				runtime: { container: entry.visible ? entry : null },
				lastUsedAt: entry.lastUsedAt,
			}),
		);
		for (const victim of selectRuntimesToEvict(
			candidates,
			MAX_HIDDEN_WEBVIEWS,
			(candidate) => this.agentActivePaneIds.has(candidate.paneId),
		)) {
			this.destroy(victim.paneId);
		}
	}

	destroy(paneId: string): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		entry.onPersist = null;
		entry.onClose = null;
		entry.resizeObserver?.disconnect();
		entry.detachHandlers();
		entry.webview.remove();
		entry.overlay.remove();
		this.entries.delete(paneId);
		this.listenersByPaneId.delete(paneId);
		this.foundInPageListenersByPaneId.delete(paneId);
		electronTrpcClient.browser.unregister.mutate({ paneId }).catch((err) => {
			console.error(
				`[browserRuntimeRegistry] unregister failed for ${paneId}:`,
				err,
			);
		});
	}

	navigate(paneId: string, url: string): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		entry.webview.loadURL(sanitizeUrl(url)).catch((err) => {
			console.error("[browserRuntimeRegistry] loadURL failed:", err);
		});
	}

	goBack(paneId: string): void {
		const entry = this.entries.get(paneId);
		if (entry?.webview.canGoBack()) entry.webview.goBack();
	}

	goForward(paneId: string): void {
		const entry = this.entries.get(paneId);
		if (entry?.webview.canGoForward()) entry.webview.goForward();
	}

	reload(paneId: string): void {
		const entry = this.entries.get(paneId);
		entry?.webview.reload();
	}

	getState(paneId: string): BrowserRuntimeState {
		return this.entries.get(paneId)?.state ?? EMPTY_STATE;
	}

	onStateChange(paneId: string, listener: () => void): () => void {
		const listeners = this.getListeners(paneId);
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}

	/** Starts (or continues) a find-in-page search; empty text clears it. */
	findInPage(
		paneId: string,
		text: string,
		options?: Electron.FindInPageOptions,
	): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		if (!text) {
			entry.webview.stopFindInPage("clearSelection");
			return;
		}
		entry.webview.findInPage(text, options);
	}

	stopFindInPage(
		paneId: string,
		action: "clearSelection" | "keepSelection" | "activateSelection",
	): void {
		this.entries.get(paneId)?.webview.stopFindInPage(action);
	}

	onFoundInPage(
		paneId: string,
		listener: (result: Electron.FoundInPageResult) => void,
	): () => void {
		let set = this.foundInPageListenersByPaneId.get(paneId);
		if (!set) {
			set = new Set();
			this.foundInPageListenersByPaneId.set(paneId, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
		};
	}

	print(paneId: string): void {
		this.entries
			.get(paneId)
			?.webview.print({ printBackground: true })
			.catch((err) => {
				console.error("[browserRuntimeRegistry] print failed:", err);
			});
	}

	setZoomFactor(paneId: string, factor: number): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		const clamped = Math.min(
			BROWSER_ZOOM.max,
			Math.max(BROWSER_ZOOM.min, factor),
		);
		entry.webview.setZoomFactor(clamped);
		this.setState(paneId, { zoomFactor: clamped });
	}

	stepZoom(paneId: string, direction: BrowserZoomDirection): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		if (direction === "reset") {
			this.setZoomFactor(paneId, 1);
			return;
		}
		// Zoom is per-origin, so another pane on the same origin may have moved
		// it since we last read it; step from what the page renders at now.
		this.refreshZoomState(paneId);
		const delta = direction === "in" ? BROWSER_ZOOM.step : -BROWSER_ZOOM.step;
		// Round to the step grid so repeated steps don't drift (1.2000000000000002).
		const next = Math.round((entry.state.zoomFactor + delta) * 100) / 100;
		this.setZoomFactor(paneId, next);
	}

	/** The pane whose `<webview>` is `element`, e.g. `document.activeElement`. */
	getPaneIdForWebview(element: Element): string | null {
		for (const [paneId, entry] of this.entries) {
			if (entry.webview === element) return paneId;
		}
		return null;
	}
}

export const browserRuntimeRegistry: BrowserRuntimeRegistryImpl =
	(import.meta.hot?.data?.browserRegistry as
		| BrowserRuntimeRegistryImpl
		| undefined) ?? new BrowserRuntimeRegistryImpl();

if (import.meta.hot) {
	import.meta.hot.data.browserRegistry = browserRuntimeRegistry;
}
