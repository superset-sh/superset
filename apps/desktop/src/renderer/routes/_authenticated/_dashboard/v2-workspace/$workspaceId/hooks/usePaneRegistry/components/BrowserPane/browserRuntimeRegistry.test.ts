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

const { browserRuntimeRegistry } = await import("./browserRuntimeRegistry");

describe("browserRuntimeRegistry detached persistence", () => {
	test("retains its persistence callback for navigation completion after detach", async () => {
		const paneId = "detached-navigation-pane";
		const persisted: string[] = [];
		const onPersist = (state: { url: string }) => persisted.push(state.url);
		const entry = {
			webview: { style: { visibility: "visible" } },
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

describe("browserRuntimeRegistry host popover passthrough", () => {
	test("keeps webviews passed through until the last open popover closes", () => {
		const makeEntry = () => ({
			webview: { style: { pointerEvents: "auto" } },
			visible: true,
		});
		const a = makeEntry();
		const b = makeEntry();
		const registryInternals = browserRuntimeRegistry as unknown as {
			entries: Map<string, ReturnType<typeof makeEntry>>;
		};
		registryInternals.entries.set("popover-pane-a", a);
		registryInternals.entries.set("popover-pane-b", b);

		try {
			browserRuntimeRegistry.setHostPopoverOpen("popover-pane-a", true);
			browserRuntimeRegistry.setHostPopoverOpen("popover-pane-b", true);
			expect(a.webview.style.pointerEvents).toBe("none");
			expect(b.webview.style.pointerEvents).toBe("none");

			// One pane closing (or unmounting) must not restore pointer events
			// while another pane's popover is still open.
			browserRuntimeRegistry.setHostPopoverOpen("popover-pane-b", false);
			expect(a.webview.style.pointerEvents).toBe("none");
			expect(b.webview.style.pointerEvents).toBe("none");

			browserRuntimeRegistry.setHostPopoverOpen("popover-pane-a", false);
			expect(a.webview.style.pointerEvents).toBe("auto");
			expect(b.webview.style.pointerEvents).toBe("auto");
		} finally {
			browserRuntimeRegistry.setHostPopoverOpen("popover-pane-a", false);
			browserRuntimeRegistry.setHostPopoverOpen("popover-pane-b", false);
			registryInternals.entries.delete("popover-pane-a");
			registryInternals.entries.delete("popover-pane-b");
		}
	});
});
