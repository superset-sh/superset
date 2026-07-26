import { describe, expect, mock, spyOn, test } from "bun:test";

const unregister = mock(async () => ({ success: true }));

mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		browser: {
			register: { mutate: async () => ({ success: true }) },
			unregister: { mutate: unregister },
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
