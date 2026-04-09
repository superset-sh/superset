/**
 * Module-level manager for persistent webview elements.
 *
 * Webviews live in a single overlay container mounted at the dashboard layout
 * level. They are NEVER reparented in the DOM — only shown/hidden and
 * repositioned — so Electron never reloads their guest processes.
 *
 * BrowserPane registers a "slot" (the DOM element where the webview should
 * visually appear). The overlay positions each webview wrapper to match its
 * slot's bounding rect.
 */

import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebviewEntry {
	webview: Electron.WebviewTag;
	wrapper: HTMLDivElement;
	webContentsId: number | null;
	faviconUrl: string | undefined;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const webviews = new Map<string, WebviewEntry>();
const slots = new Map<string, HTMLElement>();
let overlayContainer: HTMLDivElement | null = null;

// ---------------------------------------------------------------------------
// Overlay container (called by WebviewOverlay component)
// ---------------------------------------------------------------------------

export function setOverlayContainer(el: HTMLDivElement | null): void {
	overlayContainer = el;
	if (el) {
		for (const entry of webviews.values()) {
			if (!el.contains(entry.wrapper)) {
				el.appendChild(entry.wrapper);
			}
		}
	}
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function sanitizeUrl(url: string): string {
	if (/^https?:\/\//i.test(url) || url.startsWith("about:")) return url;
	if (url.startsWith("localhost") || url.startsWith("127.0.0.1"))
		return `http://${url}`;
	if (url.includes(".")) return `https://${url}`;
	return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
}

// ---------------------------------------------------------------------------
// Webview lifecycle
// ---------------------------------------------------------------------------

export function getOrCreateWebview(
	paneId: string,
	initialUrl: string,
): WebviewEntry {
	const existing = webviews.get(paneId);
	if (existing) return existing;

	// Wrapper — positioned absolutely by the overlay
	const wrapper = document.createElement("div");
	wrapper.style.position = "absolute";
	wrapper.style.overflow = "hidden";
	wrapper.style.display = "none"; // hidden until a slot is registered
	wrapper.style.pointerEvents = "auto";
	wrapper.dataset.webviewPane = paneId;

	// Webview element
	const webview = document.createElement("webview") as Electron.WebviewTag;
	webview.setAttribute("partition", "persist:superset");
	webview.setAttribute("allowpopups", "");
	webview.style.display = "flex";
	webview.style.flex = "1";
	webview.style.width = "100%";
	webview.style.height = "100%";
	webview.style.border = "none";

	wrapper.appendChild(webview);

	const entry: WebviewEntry = {
		webview,
		wrapper,
		webContentsId: null,
		faviconUrl: undefined,
	};
	webviews.set(paneId, entry);

	if (overlayContainer) {
		overlayContainer.appendChild(wrapper);
	}

	webview.src = sanitizeUrl(initialUrl);
	attachEventHandlers(paneId, entry);

	return entry;
}

export function destroyWebview(paneId: string): void {
	const entry = webviews.get(paneId);
	if (!entry) return;
	entry.wrapper.remove();
	webviews.delete(paneId);
	electronTrpcClient.browser.unregister.mutate({ paneId }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Event handlers (permanent — not tied to React lifecycle)
// ---------------------------------------------------------------------------

function attachEventHandlers(paneId: string, entry: WebviewEntry): void {
	const { webview } = entry;

	const handleDomReady = () => {
		const id = webview.getWebContentsId();
		if (entry.webContentsId !== id) {
			entry.webContentsId = id;
			electronTrpcClient.browser.register
				.mutate({ paneId, webContentsId: id })
				.catch(() => {});
		}
	};

	const handleDidStartLoading = () => {
		const store = useTabsStore.getState();
		store.updateBrowserLoading(paneId, true);
		store.setBrowserError(paneId, null);
		entry.faviconUrl = undefined;
	};

	const handleDidStopLoading = () => {
		const store = useTabsStore.getState();
		store.updateBrowserLoading(paneId, false);

		const url = webview.getURL();
		const title = webview.getTitle();
		store.updateBrowserUrl(paneId, url ?? "", title ?? "", entry.faviconUrl);

		if (url && url !== "about:blank") {
			electronTrpcClient.browserHistory.upsert
				.mutate({
					url,
					title: title ?? "",
					faviconUrl: entry.faviconUrl ?? null,
				})
				.catch(() => {});
		}
	};

	const handleDidNavigate = (e: Electron.DidNavigateEvent) => {
		const store = useTabsStore.getState();
		store.updateBrowserUrl(
			paneId,
			e.url ?? "",
			webview.getTitle() ?? "",
			entry.faviconUrl,
		);
		store.updateBrowserLoading(paneId, false);
	};

	const handleDidNavigateInPage = (e: Electron.DidNavigateInPageEvent) => {
		const store = useTabsStore.getState();
		store.updateBrowserUrl(
			paneId,
			e.url ?? "",
			webview.getTitle() ?? "",
			entry.faviconUrl,
		);
	};

	const handlePageTitleUpdated = (e: Electron.PageTitleUpdatedEvent) => {
		const store = useTabsStore.getState();
		const currentUrl = store.panes[paneId]?.browser?.currentUrl ?? "";
		store.updateBrowserUrl(paneId, currentUrl, e.title ?? "", entry.faviconUrl);
	};

	const handlePageFaviconUpdated = (e: Electron.PageFaviconUpdatedEvent) => {
		const favicons = e.favicons;
		if (favicons?.length > 0) {
			entry.faviconUrl = favicons[0];
			const store = useTabsStore.getState();
			const browser = store.panes[paneId]?.browser;
			const currentUrl = browser?.currentUrl ?? "";
			const currentTitle =
				browser?.history[browser?.historyIndex ?? 0]?.title ?? "";
			store.updateBrowserUrl(paneId, currentUrl, currentTitle, favicons[0]);
			if (currentUrl && currentUrl !== "about:blank") {
				electronTrpcClient.browserHistory.upsert
					.mutate({
						url: currentUrl,
						title: currentTitle,
						faviconUrl: favicons[0],
					})
					.catch(() => {});
			}
		}
	};

	const handleDidFailLoad = (e: Electron.DidFailLoadEvent) => {
		if (e.errorCode === -3) return; // ERR_ABORTED
		const store = useTabsStore.getState();
		store.updateBrowserLoading(paneId, false);
		store.setBrowserError(paneId, {
			code: e.errorCode ?? 0,
			description: e.errorDescription ?? "",
			url: e.validatedURL ?? "",
		});
	};

	webview.addEventListener("dom-ready", handleDomReady);
	webview.addEventListener("did-start-loading", handleDidStartLoading);
	webview.addEventListener("did-stop-loading", handleDidStopLoading);
	webview.addEventListener("did-navigate", handleDidNavigate as EventListener);
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
	webview.addEventListener("did-fail-load", handleDidFailLoad as EventListener);
}

// ---------------------------------------------------------------------------
// Slot management (called by BrowserPane)
// ---------------------------------------------------------------------------

export function registerSlot(paneId: string, element: HTMLElement): void {
	slots.set(paneId, element);
	// syncPosition checks visibility and sets display accordingly
	syncPosition(paneId);
}

export function unregisterSlot(paneId: string): void {
	slots.delete(paneId);
	const entry = webviews.get(paneId);
	if (entry) {
		entry.wrapper.style.display = "none";
	}
}

// ---------------------------------------------------------------------------
// Position sync
// ---------------------------------------------------------------------------

export function syncPosition(paneId: string): void {
	const entry = webviews.get(paneId);
	const slot = slots.get(paneId);
	if (!entry || !slot) return;

	// Hide the webview if the slot is not visible (e.g. tab is inactive and
	// has `visibility: hidden` via the getTabsToRender CSS toggling).
	// `visibility` is inherited, so this catches hidden ancestors too.
	const isVisible = getComputedStyle(slot).visibility !== "hidden";
	if (!isVisible) {
		entry.wrapper.style.display = "none";
		return;
	}

	// Hide the webview when BrowserPane is showing an error or blank-state
	// overlay. Those overlays render inside the normal stacking context and
	// cannot compete with the fixed z-index overlay, so we hide the webview
	// wrapper to let the underlying UI show through.
	const browserState = useTabsStore.getState().panes[paneId]?.browser;
	if (browserState) {
		const hasError = browserState.error && !browserState.isLoading;
		const isBlank =
			browserState.currentUrl === "about:blank" &&
			!browserState.isLoading &&
			!browserState.error;
		if (hasError || isBlank) {
			entry.wrapper.style.display = "none";
			return;
		}
	}

	entry.wrapper.style.display = "block";
	const rect = slot.getBoundingClientRect();
	const { wrapper } = entry;
	wrapper.style.left = `${rect.left}px`;
	wrapper.style.top = `${rect.top}px`;
	wrapper.style.width = `${rect.width}px`;
	wrapper.style.height = `${rect.height}px`;
}

export function syncAllPositions(): void {
	for (const paneId of slots.keys()) {
		syncPosition(paneId);
	}
}

// ---------------------------------------------------------------------------
// Navigation (called by BrowserPane via usePersistentWebview)
// ---------------------------------------------------------------------------

export function webviewNavigateTo(paneId: string, url: string): void {
	const entry = webviews.get(paneId);
	if (entry) entry.webview.loadURL(sanitizeUrl(url));
}

export function webviewReload(paneId: string): void {
	const entry = webviews.get(paneId);
	if (entry) entry.webview.reload();
}

export function webviewGoBack(paneId: string): void {
	const store = useTabsStore.getState();
	const url = store.navigateBrowserHistory(paneId, "back");
	if (url) {
		const entry = webviews.get(paneId);
		if (entry) entry.webview.loadURL(sanitizeUrl(url));
	}
}

export function webviewGoForward(paneId: string): void {
	const store = useTabsStore.getState();
	const url = store.navigateBrowserHistory(paneId, "forward");
	if (url) {
		const entry = webviews.get(paneId);
		if (entry) entry.webview.loadURL(sanitizeUrl(url));
	}
}

// ---------------------------------------------------------------------------
// Drag passthrough — prevent webviews from swallowing pane/tab drags
// ---------------------------------------------------------------------------

function setAllWrappersPointerEvents(value: string): void {
	for (const entry of webviews.values()) {
		entry.wrapper.style.pointerEvents = value;
	}
}

window.addEventListener(
	"dragstart",
	() => setAllWrappersPointerEvents("none"),
	true,
);
window.addEventListener("dragend", () => setAllWrappersPointerEvents(""), true);
window.addEventListener("drop", () => setAllWrappersPointerEvents(""), true);
