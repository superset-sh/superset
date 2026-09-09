import { describe, expect, mock, spyOn, test } from "bun:test";

const unregister = mock(async () => ({ success: true }));

mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		browser: {
			register: { mutate: async () => ({ success: true }) },
			unregister: { mutate: unregister },
			onAgentActivePanes: { subscribe: () => ({ unsubscribe: () => {} }) },
		},
		browserHistory: {
			upsert: { mutate: async () => ({ success: true }) },
		},
	},
}));

(
	document.documentElement as unknown as Record<string, unknown>
).toggleAttribute = mock(() => {});

const { pointerPassthrough } = await import("renderer/lib/pointer-passthrough");
const { browserRuntimeRegistry } = await import("./browserRuntimeRegistry");

describe("browserRuntimeRegistry detached persistence", () => {
	test("retains its persistence callback for navigation completion after detach", async () => {
		const paneId = "detached-navigation-pane";
		const persisted: string[] = [];
		const onPersist = (state: { url: string }) => persisted.push(state.url);
		const entry = {
			webview: { style: { visibility: "visible" } },
			overlay: { style: { visibility: "visible" } },
			state: {},
			onPersist,
			webContentsId: null,
			detachHandlers: () => {},
			placeholder: {},
			resizeObserver: { disconnect: () => {} },
			visible: true,
			lastUsedAt: 1,
		};
		const registryInternals = browserRuntimeRegistry as unknown as {
			entries: Map<string, typeof entry>;
		};
		registryInternals.entries.set(paneId, entry);

		try {
			browserRuntimeRegistry.detach(paneId);
			entry.onPersist?.({ url: "https://example.com/finished-navigation" });

			expect(persisted).toEqual(["https://example.com/finished-navigation"]);
		} finally {
			registryInternals.entries.delete(paneId);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	});

	test("hidden-webview eviction spares panes with a live CDP session", async () => {
		const makeEntry = (lastUsedAt: number) => ({
			webview: { remove: () => {}, style: { visibility: "hidden" } },
			overlay: { remove: () => {}, style: { visibility: "hidden" } },
			state: {},
			onPersist: null,
			webContentsId: null,
			detachHandlers: () => {},
			placeholder: null,
			resizeObserver: null,
			visible: false,
			lastUsedAt,
		});
		const registryInternals = browserRuntimeRegistry as unknown as {
			entries: Map<string, ReturnType<typeof makeEntry>>;
			agentActivePaneIds: Set<string>;
			evictExcessHiddenWebviews: () => void;
		};
		// Five hidden panes over the cap of three; the two oldest would go, but
		// the oldest has an agent attached and must survive.
		for (let i = 1; i <= 5; i++) {
			registryInternals.entries.set(`evict-pane-${i}`, makeEntry(i));
		}
		registryInternals.agentActivePaneIds = new Set(["evict-pane-1"]);

		try {
			registryInternals.evictExcessHiddenWebviews();

			const remaining = [...registryInternals.entries.keys()].filter((id) =>
				id.startsWith("evict-pane-"),
			);
			expect(remaining).toEqual([
				"evict-pane-1",
				"evict-pane-4",
				"evict-pane-5",
			]);
		} finally {
			registryInternals.agentActivePaneIds = new Set();
			for (let i = 1; i <= 5; i++) {
				registryInternals.entries.delete(`evict-pane-${i}`);
			}
		}
	});

	test("surfaces BrowserManager unregister failures", async () => {
		const paneId = "unregister-failure-pane";
		const failure = new Error("unregister failed");
		unregister.mockImplementationOnce(() => Promise.reject(failure));
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});
		const entry = {
			webview: { remove: () => {} },
			overlay: { remove: () => {} },
			onPersist: () => {},
			detachHandlers: () => {},
			resizeObserver: { disconnect: () => {} },
		};
		const registryInternals = browserRuntimeRegistry as unknown as {
			entries: Map<string, typeof entry>;
		};
		registryInternals.entries.set(paneId, entry);

		try {
			browserRuntimeRegistry.destroy(paneId);
			await Promise.resolve();

			expect(errorSpy).toHaveBeenCalledWith(
				`[browserRuntimeRegistry] unregister failed for ${paneId}:`,
				failure,
			);
		} finally {
			errorSpy.mockRestore();
			registryInternals.entries.delete(paneId);
		}
	});
});

describe("browserRuntimeRegistry pointer passthrough", () => {
	test("mirrors the passthrough state onto visible webviews only", () => {
		const makeEntry = (visible: boolean) => ({
			webview: { style: { pointerEvents: "auto" } },
			overlay: { style: {} },
			visible,
		});
		const shown = makeEntry(true);
		const parked = makeEntry(false);
		const registryInternals = browserRuntimeRegistry as unknown as {
			entries: Map<string, ReturnType<typeof makeEntry>>;
		};
		registryInternals.entries.set("passthrough-shown", shown);
		registryInternals.entries.set("passthrough-parked", parked);

		try {
			pointerPassthrough.set("test-gesture", true);
			expect(shown.webview.style.pointerEvents).toBe("none");
			expect(parked.webview.style.pointerEvents).toBe("auto");

			pointerPassthrough.set("test-gesture", false);
			expect(shown.webview.style.pointerEvents).toBe("auto");
		} finally {
			pointerPassthrough.set("test-gesture", false);
			registryInternals.entries.delete("passthrough-shown");
			registryInternals.entries.delete("passthrough-parked");
		}
	});
});

describe("browserRuntimeRegistry overlay layer", () => {
	const makeEntry = () => ({
		webview: { style: {} as Record<string, string> },
		overlay: { style: {} as Record<string, string> },
		placeholder: {
			getBoundingClientRect: () => ({
				top: 40,
				left: 300,
				width: 800,
				height: 600,
			}),
		},
		resizeObserver: { disconnect: () => {} },
		visible: true,
		lastUsedAt: 1,
	});
	const registryInternals = browserRuntimeRegistry as unknown as {
		entries: Map<string, ReturnType<typeof makeEntry>>;
		updateLayout: (entry: ReturnType<typeof makeEntry>) => void;
	};

	test("mirrors the placeholder rect onto the overlay as well as the webview", () => {
		const entry = makeEntry();
		registryInternals.updateLayout(entry);
		for (const style of [entry.webview.style, entry.overlay.style]) {
			expect(style.top).toBe("40px");
			expect(style.left).toBe("300px");
			expect(style.width).toBe("800px");
			expect(style.height).toBe("600px");
		}
	});

	test("hides the overlay with the webview on detach", () => {
		const paneId = "overlay-detach-pane";
		const entry = makeEntry();
		entry.overlay.style.visibility = "visible";
		registryInternals.entries.set(paneId, entry);
		try {
			browserRuntimeRegistry.detach(paneId);
			expect(entry.webview.style.visibility).toBe("hidden");
			expect(entry.overlay.style.visibility).toBe("hidden");
			expect(browserRuntimeRegistry.getOverlayContainer(paneId)).toBe(
				entry.overlay as unknown as HTMLElement,
			);
		} finally {
			registryInternals.entries.delete(paneId);
		}
	});

	test("reports no overlay for an unknown pane", () => {
		expect(browserRuntimeRegistry.getOverlayContainer("nope")).toBeNull();
	});
});

describe("browserRuntimeRegistry guest lifecycle", () => {
	interface LifecycleEntry {
		webview: EventTarget & { getURL?: () => string; getTitle?: () => string };
		state: {
			currentUrl: string;
			pageTitle: string;
			isLoading: boolean;
			error: { code: number } | null;
		};
		onPersist: ((state: { url: string }) => void) | null;
		onClose: (() => void) | null;
	}
	const registryInternals = browserRuntimeRegistry as unknown as {
		entries: Map<string, LifecycleEntry>;
		createEntry: (
			paneId: string,
			initialUrl: string,
			workspaceId: string,
		) => LifecycleEntry;
	};
	const makeElement = () =>
		Object.assign(new EventTarget(), {
			style: {} as Record<string, string>,
			setAttribute: () => {},
			remove: () => {},
			src: "",
		});
	const createEntry = (paneId: string) => {
		const original = document.createElement;
		document.createElement = makeElement as unknown as typeof original;
		try {
			const entry = registryInternals.createEntry(
				paneId,
				"http://localhost:3000",
				"workspace-1",
			);
			registryInternals.entries.set(paneId, entry);
			return entry;
		} finally {
			document.createElement = original;
		}
	};
	const fire = (
		target: EventTarget,
		type: string,
		props: Record<string, unknown> = {},
	) => target.dispatchEvent(Object.assign(new Event(type), props));
	// What every guest method throws once Electron has destroyed the guest.
	const deadGuest = () => {
		throw new Error("Invalid guestInstanceId: 7");
	};

	test("tracks the URL and title from events, not from the guest", () => {
		const paneId = "lifecycle-events-pane";
		const entry = createEntry(paneId);
		entry.webview.getURL = deadGuest;
		entry.webview.getTitle = deadGuest;
		const persisted: string[] = [];
		entry.onPersist = (state) => persisted.push(state.url);
		try {
			fire(entry.webview, "did-navigate", { url: "http://localhost:3000/app" });
			fire(entry.webview, "page-title-updated", { title: "App" });
			fire(entry.webview, "did-stop-loading");

			const state = browserRuntimeRegistry.getState(paneId);
			expect(state.currentUrl).toBe("http://localhost:3000/app");
			expect(state.pageTitle).toBe("App");
			expect(state.isLoading).toBe(false);
			expect(persisted).toEqual(["http://localhost:3000/app"]);

			fire(entry.webview, "did-navigate-in-page", {
				url: "http://localhost:3000/app#tab",
			});
			expect(browserRuntimeRegistry.getState(paneId).currentUrl).toBe(
				"http://localhost:3000/app#tab",
			);
		} finally {
			registryInternals.entries.delete(paneId);
		}
	});

	test("records the attempted URL of a failed main-frame load only", () => {
		const paneId = "lifecycle-failed-load-pane";
		const entry = createEntry(paneId);
		try {
			fire(entry.webview, "did-fail-load", {
				errorCode: -102,
				errorDescription: "ERR_CONNECTION_REFUSED",
				validatedURL: "http://localhost:3000/",
				isMainFrame: true,
			});
			let state = browserRuntimeRegistry.getState(paneId);
			expect(state.currentUrl).toBe("http://localhost:3000/");
			expect(state.error?.code).toBe(-102);

			fire(entry.webview, "did-fail-load", {
				errorCode: -105,
				errorDescription: "ERR_NAME_NOT_RESOLVED",
				validatedURL: "http://ads.example/",
				isMainFrame: false,
			});
			state = browserRuntimeRegistry.getState(paneId);
			expect(state.currentUrl).toBe("http://localhost:3000/");
		} finally {
			registryInternals.entries.delete(paneId);
		}
	});

	test("drops the entry and closes the pane when the guest is destroyed", () => {
		const paneId = "lifecycle-destroyed-pane";
		const entry = createEntry(paneId);
		const onClose = mock(() => {});
		entry.onClose = onClose;
		try {
			fire(entry.webview, "destroyed");

			expect(registryInternals.entries.has(paneId)).toBe(false);
			expect(onClose).toHaveBeenCalledTimes(1);
			expect(unregister).toHaveBeenCalledWith({ paneId });

			// Late events from the dead guest reach no handler.
			fire(entry.webview, "did-navigate", {
				url: "http://localhost:3000/late",
			});
			expect(browserRuntimeRegistry.getState(paneId).currentUrl).toBe(
				"about:blank",
			);
			browserRuntimeRegistry.reload(paneId);
		} finally {
			registryInternals.entries.delete(paneId);
		}
	});
});
