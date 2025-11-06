import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useImperativeHandle,
	forwardRef,
} from "react";
import type { WebviewTag } from "electron";

interface BrowserViewProps {
	tabId: string;
	url: string;
	onUrlChange: (url: string) => void;
	onLoadingChange: (isLoading: boolean) => void;
}

export interface BrowserViewRef {
	reload: () => void;
}

export const BrowserView = forwardRef<BrowserViewRef, BrowserViewProps>(
	({ tabId, url, onUrlChange, onLoadingChange }, ref) => {
		const webviewRef = useRef<WebviewTag | null>(null);
		const webviewReadyRef = useRef(false);
		const pendingLoadRef = useRef<string | null>(null);

		useImperativeHandle(ref, () => ({
			reload: () => {
				if (webviewRef.current) {
					try {
						webviewRef.current.reload();
					} catch (error) {
						console.error("Failed to reload:", error);
					}
				}
			},
		}));

		const loadWebviewUrl = useCallback((targetUrl: string) => {
			if (!targetUrl || targetUrl === "about:blank") {
				return;
			}

			const webview = webviewRef.current;
			if (!webview) {
				return;
			}

			try {
				if (webview.getURL && webview.getURL() === targetUrl) {
					return;
				}
			} catch (error) {
				// Some Electron versions throw while the webview is initializing
			}

			try {
				const loadResult = webview.loadURL(targetUrl);

				if (
					loadResult &&
					typeof (loadResult as Promise<void>).catch === "function"
				) {
					(loadResult as Promise<void>).catch((error) => {
						const { code, errno } = (error || {}) as {
							code?: string;
							errno?: number;
						};

						if (code === "ERR_ABORTED" || errno === -3) {
							return;
						}

						console.error("Failed to load preview URL:", error);
					});
				}
			} catch (error) {
				const { code, errno } = (error || {}) as {
					code?: string;
					errno?: number;
				};

				if (code === "ERR_ABORTED" || errno === -3) {
					return;
				}

				console.error("Failed to load preview URL:", error);
			}
		}, []);

		// Load URL when it changes
		useEffect(() => {
			if (webviewReadyRef.current && url) {
				loadWebviewUrl(url);
			} else if (url) {
				pendingLoadRef.current = url;
			}
		}, [url, loadWebviewUrl]);

		// Attach webview event listeners once the webview is ready
		useLayoutEffect(() => {
			const webview = webviewRef.current;
			if (!webview) return;

			let listenersAttached = false;

			const handleDidStart = () => onLoadingChange(true);
			const handleDidStop = () => onLoadingChange(false);
			const handleDidFail = (
				event: Electron.Event & { errorCode?: number; validatedURL?: string },
			) => {
				onLoadingChange(false);

				if (event.errorCode === -3) {
					// ERR_ABORTED - normal when a new navigation cancels the previous one
					return;
				}

				if (event.validatedURL && event.validatedURL !== "about:blank") {
					console.error(
						"Preview failed to load:",
						event.errorCode,
						event.validatedURL,
					);
				}
			};

			const handleNavigate = (event: Electron.Event & { url?: string }) => {
				const newUrl = event.url || webview.getURL();
				if (!newUrl || newUrl === "about:blank") {
					return;
				}

				console.log(`[BrowserView ${tabId}] handleNavigate - url:`, newUrl);

				pendingLoadRef.current = null;
				onUrlChange(newUrl);
			};

			const attachNavigationListeners = () => {
				if (listenersAttached) {
					return;
				}

				listenersAttached = true;

				webview.addEventListener("did-start-loading", handleDidStart);
				webview.addEventListener("did-stop-loading", handleDidStop);
				webview.addEventListener("did-fail-load", handleDidFail);
				webview.addEventListener("did-navigate", handleNavigate);
				webview.addEventListener("did-navigate-in-page", handleNavigate);
			};

			const flushPendingNavigation = () => {
				const pendingUrl = pendingLoadRef.current;
				const webviewUrl = (() => {
					try {
						return webview.getURL();
					} catch {
						return undefined;
					}
				})();

				if (
					pendingUrl &&
					pendingUrl !== "" &&
					pendingUrl !== "about:blank" &&
					pendingUrl !== webviewUrl
				) {
					loadWebviewUrl(pendingUrl);
					pendingLoadRef.current = null;
				}
			};

			const handleDomReady = () => {
				webviewReadyRef.current = true;
				attachNavigationListeners();

				// Sync with whatever URL the webview resolved to
				handleNavigate({
					url: webview.getURL(),
				} as Electron.Event & { url?: string });

				flushPendingNavigation();
			};

			// Wait for dom-ready event to initialize
			// Don't try to check isLoading() as it throws before webview is attached to DOM
			webview.addEventListener("dom-ready", handleDomReady);

			return () => {
				webviewReadyRef.current = false;
				pendingLoadRef.current = null;
				webview.removeEventListener("dom-ready", handleDomReady);

				if (listenersAttached) {
					webview.removeEventListener("did-start-loading", handleDidStart);
					webview.removeEventListener("did-stop-loading", handleDidStop);
					webview.removeEventListener("did-fail-load", handleDidFail);
					webview.removeEventListener("did-navigate", handleNavigate);
					webview.removeEventListener("did-navigate-in-page", handleNavigate);
				}
			};
		}, [loadWebviewUrl, onUrlChange, onLoadingChange, tabId]);

		return (
			<webview
				key={tabId}
				ref={(element) => {
					webviewRef.current = element
						? (element as unknown as WebviewTag)
						: null;
				}}
				src={url || ""}
				partition={`persist:preview-${tabId}`}
				allowpopups
				style={{
					width: "100%",
					height: "100%",
					backgroundColor: "#fff",
				}}
			/>
		);
	},
);
