import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

const webviewRegistry = new Map<string, Electron.WebviewTag>();
const registeredWebContentsIds = new Map<string, number>();
let hiddenContainer: HTMLDivElement | null = null;

function getHiddenContainer(): HTMLDivElement {
	if (!hiddenContainer) {
		hiddenContainer = document.createElement("div");
		hiddenContainer.style.position = "fixed";
		hiddenContainer.style.left = "-9999px";
		hiddenContainer.style.top = "-9999px";
		hiddenContainer.style.width = "100vw";
		hiddenContainer.style.height = "100vh";
		hiddenContainer.style.overflow = "hidden";
		hiddenContainer.style.pointerEvents = "none";
		document.body.appendChild(hiddenContainer);
	}
	return hiddenContainer;
}

export function destroyPersistentWebview(paneId: string): void {
	const webview = webviewRegistry.get(paneId);
	if (webview) {
		webview.remove();
		webviewRegistry.delete(paneId);
	}
	registeredWebContentsIds.delete(paneId);
}

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

interface UsePersistentWebviewOptions {
	paneId: string;
	initialUrl: string;
}

export function usePersistentWebview({
	paneId,
	initialUrl,
}: UsePersistentWebviewOptions) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const isHistoryNavigation = useRef(false);
	const isReparenting = useRef(false);
	const faviconUrlRef = useRef<string | undefined>(undefined);
	const initialUrlRef = useRef(initialUrl);

	const navigateBrowserHistory = useTabsStore((s) => s.navigateBrowserHistory);
	const browserState = useTabsStore((s) => s.panes[paneId]?.browser);
	const historyIndex = browserState?.historyIndex ?? 0;
	const historyLength = browserState?.history.length ?? 0;
	const canGoBack = historyIndex > 0;
	const canGoForward = historyIndex < historyLength - 1;

	const { mutate: registerBrowser } =
		electronTrpc.browser.register.useMutation();
	const { mutate: upsertHistory } =
		electronTrpc.browserHistory.upsert.useMutation();

	electronTrpc.browser.onNewWindow.useSubscription(
		{ paneId },
		{
			onData: ({ url }: { url: string }) => {
				const state = useTabsStore.getState();
				const pane = state.panes[paneId];
				if (!pane) return;
				const tab = state.tabs.find((t) => t.id === pane.tabId);
				if (!tab) return;
				state.openInBrowserPane(tab.workspaceId, url);
			},
		},
	);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let webview = webviewRegistry.get(paneId);

		if (webview) {
			// Electron may reload from the stale `src` attribute when reparenting,
			// stripping query params. Suppress those events and restore the correct URL.
			isReparenting.current = true;
			const reclaimedWv = webview;
			container.appendChild(webview);
			setTimeout(() => {
				isReparenting.current = false;
				const store = useTabsStore.getState();
				const expectedUrl = store.panes[paneId]?.browser?.currentUrl;
				if (!expectedUrl) return;
				try {
					if (reclaimedWv.getURL() !== expectedUrl) {
						isHistoryNavigation.current = true;
						reclaimedWv.loadURL(expectedUrl);
					}
				} catch {}
			}, 500);
		} else {
			webview = document.createElement("webview") as Electron.WebviewTag;
			webview.setAttribute("partition", "persist:superset");
			webview.setAttribute("allowpopups", "");
			webview.style.display = "flex";
			webview.style.flex = "1";
			webview.style.width = "100%";
			webview.style.height = "100%";
			webview.style.border = "none";

			webviewRegistry.set(paneId, webview);
			container.appendChild(webview);

			const finalUrl = sanitizeUrl(initialUrlRef.current);
			webview.src = finalUrl;
		}

		const wv = webview;

		const handleDomReady = () => {
			const webContentsId = wv.getWebContentsId();
			const previousId = registeredWebContentsIds.get(paneId);
			if (previousId !== webContentsId) {
				registeredWebContentsIds.set(paneId, webContentsId);
				registerBrowser({ paneId, webContentsId });
			}
		};

		const handleDidStartLoading = () => {
			if (isReparenting.current) return;
			const store = useTabsStore.getState();
			store.updateBrowserLoading(paneId, true);
			store.setBrowserError(paneId, null);
			faviconUrlRef.current = undefined;
		};

		const handleDidStopLoading = () => {
			if (isReparenting.current) return;
			const store = useTabsStore.getState();
			store.updateBrowserLoading(paneId, false);

			if (isHistoryNavigation.current) {
				isHistoryNavigation.current = false;
				return;
			}

			const url = wv.getURL();
			const title = wv.getTitle();
			store.updateBrowserUrl(
				paneId,
				url ?? "",
				title ?? "",
				faviconUrlRef.current,
			);

			if (url && url !== "about:blank") {
				upsertHistory({
					url,
					title: title ?? "",
					faviconUrl: faviconUrlRef.current ?? null,
				});
			}
		};

		const handleDidNavigate = (e: Electron.DidNavigateEvent) => {
			if (isReparenting.current) return;
			if (isHistoryNavigation.current) {
				isHistoryNavigation.current = false;
				return;
			}
			const store = useTabsStore.getState();
			store.updateBrowserUrl(
				paneId,
				e.url ?? "",
				wv.getTitle() ?? "",
				faviconUrlRef.current,
			);
			store.updateBrowserLoading(paneId, false);
		};

		const handleDidNavigateInPage = (e: Electron.DidNavigateInPageEvent) => {
			if (isReparenting.current) return;
			if (isHistoryNavigation.current) {
				isHistoryNavigation.current = false;
				return;
			}
			const store = useTabsStore.getState();
			store.updateBrowserUrl(
				paneId,
				e.url ?? "",
				wv.getTitle() ?? "",
				faviconUrlRef.current,
			);
		};

		const handlePageTitleUpdated = (e: Electron.PageTitleUpdatedEvent) => {
			const store = useTabsStore.getState();
			const currentUrl = store.panes[paneId]?.browser?.currentUrl ?? "";
			store.updateBrowserUrl(
				paneId,
				currentUrl,
				e.title ?? "",
				faviconUrlRef.current,
			);
		};

		const handlePageFaviconUpdated = (e: Electron.PageFaviconUpdatedEvent) => {
			const favicons = e.favicons;
			if (favicons && favicons.length > 0) {
				faviconUrlRef.current = favicons[0];
				const store = useTabsStore.getState();
				const currentUrl = store.panes[paneId]?.browser?.currentUrl ?? "";
				const currentTitle =
					store.panes[paneId]?.browser?.history[
						store.panes[paneId]?.browser?.historyIndex ?? 0
					]?.title ?? "";
				store.updateBrowserUrl(paneId, currentUrl, currentTitle, favicons[0]);
				if (currentUrl && currentUrl !== "about:blank") {
					upsertHistory({
						url: currentUrl,
						title: currentTitle,
						faviconUrl: favicons[0],
					});
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

		wv.addEventListener("dom-ready", handleDomReady);
		wv.addEventListener("did-start-loading", handleDidStartLoading);
		wv.addEventListener("did-stop-loading", handleDidStopLoading);
		wv.addEventListener("did-navigate", handleDidNavigate as EventListener);
		wv.addEventListener(
			"did-navigate-in-page",
			handleDidNavigateInPage as EventListener,
		);
		wv.addEventListener(
			"page-title-updated",
			handlePageTitleUpdated as EventListener,
		);
		wv.addEventListener(
			"page-favicon-updated",
			handlePageFaviconUpdated as EventListener,
		);
		wv.addEventListener("did-fail-load", handleDidFailLoad as EventListener);

		return () => {
			wv.removeEventListener("dom-ready", handleDomReady);
			wv.removeEventListener("did-start-loading", handleDidStartLoading);
			wv.removeEventListener("did-stop-loading", handleDidStopLoading);
			wv.removeEventListener(
				"did-navigate",
				handleDidNavigate as EventListener,
			);
			wv.removeEventListener(
				"did-navigate-in-page",
				handleDidNavigateInPage as EventListener,
			);
			wv.removeEventListener(
				"page-title-updated",
				handlePageTitleUpdated as EventListener,
			);
			wv.removeEventListener(
				"page-favicon-updated",
				handlePageFaviconUpdated as EventListener,
			);
			wv.removeEventListener(
				"did-fail-load",
				handleDidFailLoad as EventListener,
			);

			getHiddenContainer().appendChild(wv);
		};
	}, [paneId, registerBrowser, upsertHistory]);

	const goBack = useCallback(() => {
		const url = navigateBrowserHistory(paneId, "back");
		if (url) {
			isHistoryNavigation.current = true;
			const webview = webviewRegistry.get(paneId);
			if (webview) webview.loadURL(sanitizeUrl(url));
		}
	}, [paneId, navigateBrowserHistory]);

	const goForward = useCallback(() => {
		const url = navigateBrowserHistory(paneId, "forward");
		if (url) {
			isHistoryNavigation.current = true;
			const webview = webviewRegistry.get(paneId);
			if (webview) webview.loadURL(sanitizeUrl(url));
		}
	}, [paneId, navigateBrowserHistory]);

	const reload = useCallback(() => {
		const webview = webviewRegistry.get(paneId);
		if (webview) webview.reload();
	}, [paneId]);

	const navigateTo = useCallback(
		(url: string) => {
			const webview = webviewRegistry.get(paneId);
			if (webview) webview.loadURL(sanitizeUrl(url));
		},
		[paneId],
	);

	return {
		containerRef,
		goBack,
		goForward,
		reload,
		navigateTo,
		canGoBack,
		canGoForward,
	};
}
