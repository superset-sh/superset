import { describe, expect, mock, test } from "bun:test";

// Mock Electron tRPC and the tabs store before loading the module under test.
// These are required by usePersistentWebview at module-evaluation time.
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		browser: {
			register: { useMutation: () => ({ mutate: mock(() => {}) }) },
			onNewWindow: {
				useSubscription: mock(() => {}),
			},
		},
		browserHistory: {
			upsert: { useMutation: () => ({ mutate: mock(() => {}) }) },
		},
	},
}));

mock.module("renderer/stores/tabs/store", () => ({
	useTabsStore: mock((_selector: (s: unknown) => unknown) => ({})),
}));

// Dynamic import AFTER mocks so the module resolves against the mocks above.
const { sanitizeUrl } = await import("./usePersistentWebview");

// ---------------------------------------------------------------------------
// sanitizeUrl — URL normalization for the webview address bar
// ---------------------------------------------------------------------------

describe("sanitizeUrl", () => {
	test("passes http:// URLs through unchanged", () => {
		expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
	});

	test("passes https:// URLs through unchanged", () => {
		expect(sanitizeUrl("https://example.com/path?q=1")).toBe(
			"https://example.com/path?q=1",
		);
	});

	test("is case-insensitive for the scheme (HTTP:// / HTTPS://)", () => {
		expect(sanitizeUrl("HTTP://EXAMPLE.COM")).toBe("HTTP://EXAMPLE.COM");
		expect(sanitizeUrl("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
	});

	test("passes about: URLs through unchanged", () => {
		expect(sanitizeUrl("about:blank")).toBe("about:blank");
	});

	test("adds http:// prefix to localhost URLs", () => {
		expect(sanitizeUrl("localhost:3000")).toBe("http://localhost:3000");
	});

	test("adds http:// prefix to 127.0.0.1 URLs", () => {
		expect(sanitizeUrl("127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
	});

	test("adds https:// to bare domain names containing a dot", () => {
		expect(sanitizeUrl("example.com")).toBe("https://example.com");
		expect(sanitizeUrl("sub.example.com/page")).toBe(
			"https://sub.example.com/page",
		);
	});

	test("converts bare keywords (no dot) to a Google search URL", () => {
		expect(sanitizeUrl("hello world")).toBe(
			"https://www.google.com/search?q=hello%20world",
		);
		expect(sanitizeUrl("typescript")).toBe(
			"https://www.google.com/search?q=typescript",
		);
	});
});

// ---------------------------------------------------------------------------
// Bug #1637 — Browser pane reloads every time you switch away and back
//
// Root cause: usePersistentWebview moves the <webview> element between DOM
// containers when tabs are switched. In Electron, reparenting a <webview>
// element causes it to reload its page, losing all state (scroll position,
// form inputs, etc.).
//
// Lifecycle today:
//   1. BrowserPane mounts    → effect:  container.appendChild(webview)   ← initial load
//   2. Tab switch away       → cleanup: getHiddenContainer().appendChild(wv)  ← reload!
//   3. Tab switch back       → effect:  container.appendChild(webview)   ← reload again!
//
// Expected fix: keep the webview in one place and toggle CSS
// visibility/display rather than reparenting it between DOM containers.
// ---------------------------------------------------------------------------

describe("Bug #1637 - browser pane reloads on tab switch", () => {
	test("webview parent element should not change when switching tabs", () => {
		// We record which container the webview is appended to on each operation.
		// A correct (fixed) implementation would append it exactly ONCE (initial mount)
		// and then only toggle CSS — the parent container would never change.

		type MockEl = { id: string };

		const parentHistory: string[] = [];

		function makeContainer(id: string) {
			return {
				id,
				appendChild(_child: MockEl) {
					parentHistory.push(id);
				},
			};
		}

		const activeContainer = makeContainer("active-container");
		const hiddenContainer = makeContainer("hidden-container");
		const mockWebview: MockEl = { id: "webview-pane-1" };

		// Step 1 — Initial mount: webview is created and appended to the active container.
		activeContainer.appendChild(mockWebview);

		// Step 2 — Tab switch away: usePersistentWebview cleanup runs.
		//   Current code (usePersistentWebview.ts ~line 323):
		//     getHiddenContainer().appendChild(wv)
		hiddenContainer.appendChild(mockWebview);

		// Step 3 — Tab switch back: usePersistentWebview effect runs again.
		//   Current code (usePersistentWebview.ts ~line 136):
		//     container.appendChild(webview)   // "Reclaim from hidden container"
		activeContainer.appendChild(mockWebview);

		// Expected: webview is appended only once, always to the active container.
		// A CSS-based fix (display:none / visibility:hidden) would never reparent it.
		//
		// Actual (current buggy behaviour): the webview visits three containers —
		//   ["active-container", "hidden-container", "active-container"]
		// Each DOM reparent in Electron triggers a full page reload.
		expect(parentHistory).toEqual(["active-container"]);
		// ^ FAILS: parentHistory is
		//   ["active-container", "hidden-container", "active-container"]
	});
});
