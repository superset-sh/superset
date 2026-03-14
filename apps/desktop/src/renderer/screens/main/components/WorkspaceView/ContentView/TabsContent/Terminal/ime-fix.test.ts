import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";

// Capture originals before any overrides
const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalLocalStorage = globalThis.localStorage;

// Mock browser globals (needed at module scope for dynamic import)
globalThis.window = globalThis as unknown as Window & typeof globalThis;
globalThis.navigator = {
	platform: "MacIntel",
	userAgent:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	language: "en-US",
} as unknown as Navigator;

// Mock localStorage
const mockStorage = new Map<string, string>();
globalThis.localStorage = {
	getItem: (key: string) => mockStorage.get(key) ?? null,
	setItem: (key: string, val: string) => mockStorage.set(key, val),
	removeItem: (key: string) => mockStorage.delete(key),
	clear: () => mockStorage.clear(),
	get length() {
		return mockStorage.size;
	},
	key: (_index: number) => null,
} as unknown as Storage;

// Mock dependencies
mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		external: {
			openUrl: { mutate: mock(() => Promise.resolve()) },
			openFileInEditor: { mutate: mock(() => Promise.resolve()) },
		},
		uiState: {
			hotkeys: {
				get: { query: mock(() => Promise.resolve(null)) },
			},
		},
	},
}));

// Mock other imports that might fail in node/bun environment
mock.module("@superset/ui/sonner", () => ({ toast: { error: mock() } }));
mock.module("@xterm/addon-clipboard", () => ({ ClipboardAddon: class {} }));
mock.module("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
mock.module("@xterm/addon-image", () => ({ ImageAddon: class {} }));
mock.module("@xterm/addon-ligatures", () => ({ LigaturesAddon: class {} }));
mock.module("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));
mock.module("@xterm/addon-webgl", () => ({ WebglAddon: class {} }));
mock.module("@xterm/addon-search", () => ({ SearchAddon: class {} }));

const { setupKeyboardHandler } = await import("./helpers");

describe("IME Fix - setupKeyboardHandler on macOS", () => {
	beforeEach(() => {
		globalThis.window = globalThis as unknown as Window & typeof globalThis;
		globalThis.navigator = {
			platform: "MacIntel",
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			language: "en-US",
		} as unknown as Navigator;
		mockStorage.clear();
	});

	afterEach(() => {
		globalThis.window = originalWindow;
		globalThis.navigator = originalNavigator;
		globalThis.localStorage = originalLocalStorage;
	});

	it("prevents default and defers onWrite for Option+Left", async () => {
		const captured: { handler: ((event: KeyboardEvent) => boolean) | null } = {
			handler: null,
		};
		const xterm = {
			attachCustomKeyEventHandler: (
				next: (event: KeyboardEvent) => boolean,
			) => {
				captured.handler = next;
			},
		};

		const onWrite = mock(() => {});
		setupKeyboardHandler(xterm as unknown as XTerm, { onWrite });

		const preventDefault = mock(() => {});
		const event = {
			type: "keydown",
			key: "ArrowLeft",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
			preventDefault,
		} as unknown as KeyboardEvent;

		const result = captured.handler?.(event);

		expect(result).toBe(false);
		expect(preventDefault).toHaveBeenCalled();

		// Should not be called immediately
		expect(onWrite).not.toHaveBeenCalled();

		// Wait for deferral (50ms)
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(onWrite).toHaveBeenCalledWith("\x1bb");
	});

	it("prevents default and defers onWrite for Option+Right", async () => {
		const captured: { handler: ((event: KeyboardEvent) => boolean) | null } = {
			handler: null,
		};
		const xterm = {
			attachCustomKeyEventHandler: (
				next: (event: KeyboardEvent) => boolean,
			) => {
				captured.handler = next;
			},
		};

		const onWrite = mock(() => {});
		setupKeyboardHandler(xterm as unknown as XTerm, { onWrite });

		const preventDefault = mock(() => {});
		const event = {
			type: "keydown",
			key: "ArrowRight",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
			preventDefault,
		} as unknown as KeyboardEvent;

		const result = captured.handler?.(event);

		expect(result).toBe(false);
		expect(preventDefault).toHaveBeenCalled();

		// Should not be called immediately
		expect(onWrite).not.toHaveBeenCalled();

		// Wait for deferral (50ms)
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(onWrite).toHaveBeenCalledWith("\x1bf");
	});

	it("blocks bare Alt keydown on macOS to prevent CompositionHelper corruption", () => {
		const captured: { handler: ((event: KeyboardEvent) => boolean) | null } = {
			handler: null,
		};
		const xterm = {
			attachCustomKeyEventHandler: (
				next: (event: KeyboardEvent) => boolean,
			) => {
				captured.handler = next;
			},
		};

		const onWrite = mock(() => {});
		setupKeyboardHandler(xterm as unknown as XTerm, { onWrite });

		const event = {
			type: "keydown",
			key: "Alt",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
		} as unknown as KeyboardEvent;

		const result = captured.handler?.(event);

		// Should return false to block the event from reaching xterm's CompositionHelper
		expect(result).toBe(false);
		expect(onWrite).not.toHaveBeenCalled();
	});

	it("cancels deferred writes on cleanup", async () => {
		const captured: { handler: ((event: KeyboardEvent) => boolean) | null } = {
			handler: null,
		};
		const xterm = {
			attachCustomKeyEventHandler: (
				next: (event: KeyboardEvent) => boolean,
			) => {
				captured.handler = next;
			},
		};

		const onWrite = mock(() => {});
		const cleanup = setupKeyboardHandler(xterm as unknown as XTerm, {
			onWrite,
		});

		const preventDefault = mock(() => {});
		const event = {
			type: "keydown",
			key: "ArrowLeft",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
			preventDefault,
		} as unknown as KeyboardEvent;

		captured.handler?.(event);

		// Cleanup before the deferred write fires
		cleanup();

		// Wait past the deferral window
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(onWrite).not.toHaveBeenCalled();
	});
});
