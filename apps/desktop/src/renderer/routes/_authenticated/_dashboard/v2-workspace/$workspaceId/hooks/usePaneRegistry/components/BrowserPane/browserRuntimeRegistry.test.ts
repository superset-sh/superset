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
