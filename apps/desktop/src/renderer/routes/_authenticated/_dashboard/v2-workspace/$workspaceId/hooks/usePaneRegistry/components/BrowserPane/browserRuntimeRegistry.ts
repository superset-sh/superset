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
	state: BrowserRuntimeState;
	onPersist: ((state: PersistableBrowserState) => void) | null;
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
	private windowDragPassthrough = false;
	private shellInteractionPassthrough = false;
	// Panes whose host popover (the toolbar's overflow menu) is open. The
	// webview swallows pointer events, so a click on the page would never
	// reach the document listener Radix dismisses on; passing the click
	// through to the host lets it dismiss the popover instead, as in a real
	// browser. Keyed by pane so one pane closing can't drop another's.
	private hostPopoverOpenPaneIds = new Set<string>();
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

	private installGlobalListeners() {
		if (this.globalListenersInstalled) return;
		this.globalListenersInstalled = true;

		window.addEventListener(
			"dragstart",
			() => this.setWindowDragPassthrough(true),
			true,
		);
		window.addEventListener(
			"dragend",
			() => this.setWindowDragPassthrough(false),
			true,
		);
		window.addEventListener(
			"drop",
			() => this.setWindowDragPassthrough(false),
			true,
		);
		window.addEventListener("blur", () => this.setWindowDragPassthrough(false));

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
	}

	private setWindowDragPassthrough(passthrough: boolean) {
		const wasActive = this.isPointerPassthroughActive();
		this.windowDragPassthrough = passthrough;
		this.applyPointerPassthroughIfChanged(wasActive);
	}

	setShellInteractionPassthrough(passthrough: boolean): void {
		const wasActive = this.isPointerPassthroughActive();
		this.shellInteractionPassthrough = passthrough;
		this.applyPointerPassthroughIfChanged(wasActive);
	}

	setHostPopoverOpen(paneId: string, open: boolean): void {
		const wasActive = this.isPointerPassthroughActive();
		if (open) this.hostPopoverOpenPaneIds.add(paneId);
		else this.hostPopoverOpenPaneIds.delete(paneId);
		this.applyPointerPassthroughIfChanged(wasActive);
	}

	private isPointerPassthroughActive() {
		return (
			this.windowDragPassthrough ||
			this.shellInteractionPassthrough ||
			this.hostPopoverOpenPaneIds.size > 0
		);
	}

	private applyPointerPassthroughIfChanged(wasActive: boolean) {
		const isActive = this.isPointerPassthroughActive();
		if (wasActive !== isActive) this.applyPointerPassthrough();
	}

	private applyPointerPassthrough() {
		const passthrough = this.isPointerPassthroughActive();
		for (const entry of this.entries.values()) {
			if (!entry.visible) continue;
			entry.webview.style.pointerEvents = passthrough ? "none" : "auto";
		}
	}

	private updateLayout(entry: RegistryEntry) {
		if (!entry.placeholder) return;
		const rect = entry.placeholder.getBoundingClientRect();
		const w = entry.webview;
		w.style.top = `${rect.top}px`;
		w.style.left = `${rect.left}px`;
		w.style.width = `${rect.width}px`;
		w.style.height = `${rect.height}px`;
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

		const entry: RegistryEntry = {
			webview,
			state: { ...EMPTY_STATE, currentUrl: initialUrl },
			onPersist: null,
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

		const handleDidStopLoading = () => {
			const url = webview.getURL() ?? "";
			const title = webview.getTitle() ?? "";
			this.setState(paneId, {
				isLoading: false,
				currentUrl: url,
				pageTitle: title,
			});
			this.refreshNavState(paneId);
			this.refreshZoomState(paneId);
			if (url && url !== "about:blank") {
				electronTrpcClient.browserHistory.upsert
					.mutate({ url, title, faviconUrl: entry.state.faviconUrl })
					.catch((err) => {
						console.error("[browserRuntimeRegistry] upsert history:", err);
					});
			}
			firePersist();
		};

		const handleDidNavigate = (e: Electron.DidNavigateEvent) => {
			const url = e.url ?? "";
			const title = webview.getTitle() ?? "";
			this.setState(paneId, {
				currentUrl: url,
				pageTitle: title,
				isLoading: false,
			});
			this.refreshNavState(paneId);
			this.refreshZoomState(paneId);
		};

		const handleDidNavigateInPage = (e: Electron.DidNavigateInPageEvent) => {
			const url = e.url ?? "";
			const title = webview.getTitle() ?? "";
			this.setState(paneId, { currentUrl: url, pageTitle: title });
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
			this.setState(paneId, {
				isLoading: false,
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
		};

		return entry;
	}

	attach(
		paneId: string,
		placeholder: HTMLElement,
		initialUrl: string,
		workspaceId: string,
		onPersist: (state: PersistableBrowserState) => void,
	): void {
		const root = this.ensureRootContainer();
		let entry = this.entries.get(paneId);
		if (!entry) {
			entry = this.createEntry(paneId, initialUrl, workspaceId);
			this.entries.set(paneId, entry);
			root.appendChild(entry.webview);
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
		this.applyPointerPassthrough();
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
		entry.resizeObserver?.disconnect();
		entry.detachHandlers();
		entry.webview.remove();
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
