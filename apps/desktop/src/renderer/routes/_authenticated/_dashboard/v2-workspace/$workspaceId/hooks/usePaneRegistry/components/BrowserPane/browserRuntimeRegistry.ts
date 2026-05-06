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
	webContentsId: number | null;
	detachHandlers: () => void;
	placeholder: HTMLElement | null;
	resizeObserver: ResizeObserver | null;
	visible: boolean;
}

const EMPTY_STATE: BrowserRuntimeState = Object.freeze({
	currentUrl: "about:blank",
	pageTitle: "",
	faviconUrl: null,
	isLoading: false,
	error: null,
	canGoBack: false,
	canGoForward: false,
});

const ROOT_CONTAINER_ID = "browser-runtime-root";

class BrowserRuntimeRegistryImpl {
	private entries = new Map<string, RegistryEntry>();
	private listenersByPaneId = new Map<string, Set<() => void>>();
	private rootContainer: HTMLDivElement | null = null;
	private globalListenersInstalled = false;
	private windowDragPassthrough = false;
	private shellInteractionPassthrough = false;

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

	private isPointerPassthroughActive() {
		return this.windowDragPassthrough || this.shellInteractionPassthrough;
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

	private createEntry(paneId: string, initialUrl: string): RegistryEntry {
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
			webContentsId: null,
			detachHandlers: () => {},
			placeholder: null,
			resizeObserver: null,
			visible: false,
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
					.mutate({ paneId, webContentsId })
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
		};

		return entry;
	}

	attach(
		paneId: string,
		placeholder: HTMLElement,
		initialUrl: string,
		onPersist: (state: PersistableBrowserState) => void,
	): void {
		const root = this.ensureRootContainer();
		let entry = this.entries.get(paneId);
		if (!entry) {
			entry = this.createEntry(paneId, initialUrl);
			this.entries.set(paneId, entry);
			root.appendChild(entry.webview);
		} else {
			this.refreshNavState(paneId);
		}
		entry.onPersist = onPersist;
		entry.placeholder = placeholder;
		entry.visible = true;

		entry.resizeObserver?.disconnect();
		const observer = new ResizeObserver(() => {
			if (entry) this.updateLayout(entry);
		});
		observer.observe(placeholder);
		entry.resizeObserver = observer;

		this.updateLayout(entry);
		entry.webview.style.visibility = "visible";
		this.applyPointerPassthrough();
	}

	detach(paneId: string): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		entry.onPersist = null;
		entry.placeholder = null;
		entry.resizeObserver?.disconnect();
		entry.resizeObserver = null;
		entry.visible = false;
		entry.webview.style.visibility = "hidden";
	}

	destroy(paneId: string): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		entry.resizeObserver?.disconnect();
		entry.detachHandlers();
		entry.webview.remove();
		this.entries.delete(paneId);
		this.listenersByPaneId.delete(paneId);
		electronTrpcClient.browser.unregister.mutate({ paneId }).catch(() => {});
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
}

export const browserRuntimeRegistry: BrowserRuntimeRegistryImpl =
	(import.meta.hot?.data?.browserRegistry as
		| BrowserRuntimeRegistryImpl
		| undefined) ?? new BrowserRuntimeRegistryImpl();

if (import.meta.hot) {
	import.meta.hot.data.browserRegistry = browserRuntimeRegistry;
}
