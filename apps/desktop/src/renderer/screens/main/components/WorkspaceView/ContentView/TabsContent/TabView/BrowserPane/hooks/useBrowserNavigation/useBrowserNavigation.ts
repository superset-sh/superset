import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { NavigationEvent } from "shared/browser-types";

interface UseBrowserNavigationOptions {
	paneId: string;
	initialUrl: string;
	isUrlBarFocused: boolean;
}

export function useBrowserNavigation({
	paneId,
	initialUrl,
	isUrlBarFocused,
}: UseBrowserNavigationOptions) {
	const contentRef = useRef<HTMLDivElement | null>(null);
	const isHistoryNavigation = useRef(false);
	const faviconUrlRef = useRef<string | undefined>(undefined);
	const rafIdRef = useRef<number | null>(null);
	const createdRef = useRef(false);

	const navigateBrowserHistory = useTabsStore((s) => s.navigateBrowserHistory);
	const browserState = useTabsStore((s) => s.panes[paneId]?.browser);
	const historyIndex = browserState?.historyIndex ?? 0;
	const historyLength = browserState?.history.length ?? 0;
	const canGoBack = historyIndex > 0;
	const canGoForward = historyIndex < historyLength - 1;

	const { mutate: createBrowser } = electronTrpc.browser.create.useMutation();
	const { mutate: setBounds } = electronTrpc.browser.setBounds.useMutation();
	const { mutate: setVisibility } =
		electronTrpc.browser.setVisibility.useMutation();
	const { mutate: navigateMutation } =
		electronTrpc.browser.navigate.useMutation();
	const { mutate: reloadMutation } = electronTrpc.browser.reload.useMutation();
	const { mutate: upsertHistory } =
		electronTrpc.browserHistory.upsert.useMutation();

	// Report current bounds of the content div to the main process
	const reportBounds = useCallback(() => {
		const el = contentRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		setBounds({
			paneId,
			bounds: {
				x: Math.round(rect.x),
				y: Math.round(rect.y),
				width: Math.round(rect.width),
				height: Math.round(rect.height),
			},
		});
	}, [paneId, setBounds]);

	// Create the browser view on mount, destroy visibility on unmount
	useEffect(() => {
		if (!createdRef.current) {
			createdRef.current = true;
			createBrowser({ paneId, initialUrl });
		}
		setVisibility({ paneId, visible: true });

		return () => {
			setVisibility({ paneId, visible: false });
		};
	}, [paneId, initialUrl, createBrowser, setVisibility]);

	// ResizeObserver to keep bounds in sync
	useEffect(() => {
		const el = contentRef.current;
		if (!el) return;

		const observer = new ResizeObserver(() => {
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
			}
			rafIdRef.current = requestAnimationFrame(() => {
				rafIdRef.current = null;
				reportBounds();
			});
		});
		observer.observe(el);

		// Also report bounds on window resize
		const handleWindowResize = () => {
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
			}
			rafIdRef.current = requestAnimationFrame(() => {
				rafIdRef.current = null;
				reportBounds();
			});
		};
		window.addEventListener("resize", handleWindowResize);

		// Initial bounds report
		reportBounds();

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", handleWindowResize);
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
			}
		};
	}, [reportBounds]);

	// Handle navigation events from the main process
	electronTrpc.browser.onNavigation.useSubscription(
		{ paneId },
		{
			onData: (event: NavigationEvent) => {
				const store = useTabsStore.getState();

				switch (event.type) {
					case "did-start-loading": {
						store.updateBrowserLoading(paneId, true);
						store.setBrowserError(paneId, null);
						faviconUrlRef.current = undefined;
						break;
					}
					case "did-stop-loading": {
						store.updateBrowserLoading(paneId, false);

						if (isHistoryNavigation.current) {
							isHistoryNavigation.current = false;
							return;
						}

						const url = event.url;
						const title = event.title;
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
						break;
					}
					case "did-navigate": {
						if (isHistoryNavigation.current) {
							isHistoryNavigation.current = false;
							return;
						}
						store.updateBrowserUrl(
							paneId,
							event.url ?? "",
							event.title ?? "",
							faviconUrlRef.current,
						);
						store.updateBrowserLoading(paneId, false);
						break;
					}
					case "did-navigate-in-page": {
						if (isHistoryNavigation.current) {
							isHistoryNavigation.current = false;
							return;
						}
						store.updateBrowserUrl(
							paneId,
							event.url ?? "",
							event.title ?? "",
							faviconUrlRef.current,
						);
						break;
					}
					case "page-title-updated": {
						const currentUrl =
							event.url ?? store.panes[paneId]?.browser?.currentUrl ?? "";
						store.updateBrowserUrl(
							paneId,
							currentUrl,
							event.title ?? "",
							faviconUrlRef.current,
						);
						break;
					}
					case "page-favicon-updated": {
						const favicons = event.favicons;
						if (favicons && favicons.length > 0) {
							faviconUrlRef.current = favicons[0];
							const currentUrl =
								event.url ?? store.panes[paneId]?.browser?.currentUrl ?? "";
							const currentTitle =
								event.title ??
								store.panes[paneId]?.browser?.history[
									store.panes[paneId]?.browser?.historyIndex ?? 0
								]?.title ??
								"";
							store.updateBrowserUrl(
								paneId,
								currentUrl,
								currentTitle,
								favicons[0],
							);
							if (currentUrl && currentUrl !== "about:blank") {
								upsertHistory({
									url: currentUrl,
									title: currentTitle,
									faviconUrl: favicons[0],
								});
							}
						}
						break;
					}
					case "did-fail-load": {
						if (event.errorCode === -3) return;
						store.updateBrowserLoading(paneId, false);
						store.setBrowserError(paneId, {
							code: event.errorCode ?? 0,
							description: event.errorDescription ?? "",
							url: event.validatedURL ?? "",
						});
						break;
					}
				}
			},
		},
	);

	// Subscribe to new-window events (target="_blank" links, window.open)
	electronTrpc.browser.onNewWindow.useSubscription(
		{ paneId },
		{
			onData: ({ url }) => {
				const state = useTabsStore.getState();
				const pane = state.panes[paneId];
				if (!pane) return;
				const tab = state.tabs.find((t) => t.id === pane.tabId);
				if (!tab) return;
				state.addBrowserTab(tab.workspaceId, url);
			},
		},
	);

	// Visibility control: hide the native view when overlays need to show
	const isLoading = browserState?.isLoading ?? false;
	const loadError = browserState?.error ?? null;
	const currentUrl = browserState?.currentUrl ?? "";
	const isBlankPage = currentUrl === "about:blank";

	useEffect(() => {
		const shouldHide =
			isUrlBarFocused || (!!loadError && !isLoading) || isBlankPage;
		setVisibility({ paneId, visible: !shouldHide });
	}, [
		paneId,
		isUrlBarFocused,
		loadError,
		isLoading,
		isBlankPage,
		setVisibility,
	]);

	// Navigation methods
	const goBack = useCallback(() => {
		const url = navigateBrowserHistory(paneId, "back");
		if (url) {
			isHistoryNavigation.current = true;
			navigateMutation({ paneId, url });
		}
	}, [paneId, navigateBrowserHistory, navigateMutation]);

	const goForward = useCallback(() => {
		const url = navigateBrowserHistory(paneId, "forward");
		if (url) {
			isHistoryNavigation.current = true;
			navigateMutation({ paneId, url });
		}
	}, [paneId, navigateBrowserHistory, navigateMutation]);

	const reload = useCallback(() => {
		reloadMutation({ paneId });
	}, [paneId, reloadMutation]);

	const navigateTo = useCallback(
		(url: string) => {
			navigateMutation({ paneId, url });
		},
		[paneId, navigateMutation],
	);

	return {
		contentRef,
		goBack,
		goForward,
		reload,
		navigateTo,
		canGoBack,
		canGoForward,
	};
}
