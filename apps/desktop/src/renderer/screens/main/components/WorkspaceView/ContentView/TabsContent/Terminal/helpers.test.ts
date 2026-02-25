import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";

// Mock localStorage for Node.js test environment
const mockStorage = new Map<string, string>();
const mockLocalStorage = {
	getItem: (key: string) => mockStorage.get(key) ?? null,
	setItem: (key: string, value: string) => mockStorage.set(key, value),
	removeItem: (key: string) => mockStorage.delete(key),
	clear: () => mockStorage.clear(),
};

// @ts-expect-error - mocking global localStorage
globalThis.localStorage = mockLocalStorage;

// Mock trpc-client to avoid electronTRPC dependency
mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		external: {
			openUrl: { mutate: mock(() => Promise.resolve()) },
			openFileInEditor: { mutate: mock(() => Promise.resolve()) },
		},
		uiState: {
			hotkeys: {
				get: { query: mock(() => Promise.resolve(null)) },
				set: { mutate: mock(() => Promise.resolve()) },
			},
		},
	},
	electronReactClient: {},
}));

// Import after mocks are set up
const {
	getDefaultTerminalBg,
	getDefaultTerminalTheme,
	setupKeyboardHandler,
	setupPasteHandler,
} = await import("./helpers");

describe("getDefaultTerminalTheme", () => {
	beforeEach(() => {
		mockStorage.clear();
	});

	afterEach(() => {
		mockStorage.clear();
	});

	it("should return cached terminal colors from localStorage", () => {
		const cachedTerminal = {
			background: "#272822",
			foreground: "#f8f8f2",
			cursor: "#f8f8f0",
			red: "#f92672",
			green: "#a6e22e",
		};
		localStorage.setItem("theme-terminal", JSON.stringify(cachedTerminal));

		const theme = getDefaultTerminalTheme();

		expect(theme.background).toBe("#272822");
		expect(theme.foreground).toBe("#f8f8f2");
		expect(theme.cursor).toBe("#f8f8f0");
	});

	it("should fall back to theme-id lookup when no cached terminal", () => {
		localStorage.setItem("theme-id", "light");

		const theme = getDefaultTerminalTheme();

		// Light theme has white background
		expect(theme.background).toBe("#ffffff");
	});

	it("should fall back to default dark theme when localStorage is empty", () => {
		const theme = getDefaultTerminalTheme();

		// Default theme is dark (ember)
		expect(theme.background).toBe("#151110");
	});

	it("should handle invalid JSON in cached terminal gracefully", () => {
		localStorage.setItem("theme-terminal", "invalid json{");

		const theme = getDefaultTerminalTheme();

		// Should fall back to default
		expect(theme.background).toBe("#151110");
	});
});

describe("getDefaultTerminalBg", () => {
	beforeEach(() => {
		mockStorage.clear();
	});

	afterEach(() => {
		mockStorage.clear();
	});

	it("should return background from cached theme", () => {
		localStorage.setItem(
			"theme-terminal",
			JSON.stringify({ background: "#282c34" }),
		);

		expect(getDefaultTerminalBg()).toBe("#282c34");
	});

	it("should return default background when no cache", () => {
		expect(getDefaultTerminalBg()).toBe("#151110");
	});
});

describe("setupKeyboardHandler", () => {
	const originalNavigator = globalThis.navigator;

	afterEach(() => {
		// Restore navigator between tests
		globalThis.navigator = originalNavigator;
	});

	it("maps Option+Left/Right to Meta+B/F on macOS", () => {
		// @ts-expect-error - mocking navigator for tests
		globalThis.navigator = { platform: "MacIntel" };

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

		captured.handler?.({
			type: "keydown",
			key: "ArrowLeft",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
		} as KeyboardEvent);
		captured.handler?.({
			type: "keydown",
			key: "ArrowRight",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
		} as KeyboardEvent);

		expect(onWrite).toHaveBeenCalledWith("\x1bb");
		expect(onWrite).toHaveBeenCalledWith("\x1bf");
	});

	it("maps Ctrl+Left/Right to Meta+B/F on Windows", () => {
		// @ts-expect-error - mocking navigator for tests
		globalThis.navigator = { platform: "Win32" };

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

		captured.handler?.({
			type: "keydown",
			key: "ArrowLeft",
			altKey: false,
			metaKey: false,
			ctrlKey: true,
			shiftKey: false,
		} as KeyboardEvent);
		captured.handler?.({
			type: "keydown",
			key: "ArrowRight",
			altKey: false,
			metaKey: false,
			ctrlKey: true,
			shiftKey: false,
		} as KeyboardEvent);

		expect(onWrite).toHaveBeenCalledWith("\x1bb");
		expect(onWrite).toHaveBeenCalledWith("\x1bf");
	});
});

describe("setupPasteHandler", () => {
	function createXtermStub() {
		const listeners = new Map<string, EventListener>();
		const textarea = {
			addEventListener: mock((eventName: string, listener: EventListener) => {
				listeners.set(eventName, listener);
			}),
			removeEventListener: mock((eventName: string) => {
				listeners.delete(eventName);
			}),
		} as unknown as HTMLTextAreaElement;
		const paste = mock(() => {});
		const xterm = {
			textarea,
			paste,
		} as unknown as XTerm;
		return { xterm, listeners, paste };
	}

	it("forwards Ctrl+V for image-only clipboard payloads", () => {
		const { xterm, listeners } = createXtermStub();
		const onWrite = mock(() => {});
		setupPasteHandler(xterm, { onWrite });

		const preventDefault = mock(() => {});
		const stopImmediatePropagation = mock(() => {});
		const pasteEvent = {
			clipboardData: {
				getData: mock(() => ""),
				items: [{ kind: "file", type: "image/png" }],
				types: ["Files", "image/png"],
			},
			preventDefault,
			stopImmediatePropagation,
		} as unknown as ClipboardEvent;

		const pasteListener = listeners.get("paste");
		expect(pasteListener).toBeDefined();
		pasteListener?.(pasteEvent);

		expect(onWrite).toHaveBeenCalledWith("\x16");
		expect(preventDefault).toHaveBeenCalled();
		expect(stopImmediatePropagation).toHaveBeenCalled();
	});

	it("forwards Ctrl+V for non-text clipboard payloads without plain text", () => {
		const { xterm, listeners } = createXtermStub();
		const onWrite = mock(() => {});
		setupPasteHandler(xterm, { onWrite });

		const preventDefault = mock(() => {});
		const stopImmediatePropagation = mock(() => {});
		const pasteEvent = {
			clipboardData: {
				getData: mock(() => ""),
				items: [{ kind: "string", type: "text/html" }],
				types: ["text/html"],
			},
			preventDefault,
			stopImmediatePropagation,
		} as unknown as ClipboardEvent;

		const pasteListener = listeners.get("paste");
		expect(pasteListener).toBeDefined();
		pasteListener?.(pasteEvent);

		expect(onWrite).toHaveBeenCalledWith("\x16");
		expect(preventDefault).toHaveBeenCalled();
		expect(stopImmediatePropagation).toHaveBeenCalled();
	});

	it("ignores empty clipboard payloads", () => {
		const { xterm, listeners } = createXtermStub();
		const onWrite = mock(() => {});
		setupPasteHandler(xterm, { onWrite });

		const preventDefault = mock(() => {});
		const stopImmediatePropagation = mock(() => {});
		const pasteEvent = {
			clipboardData: {
				getData: mock(() => ""),
				items: [],
				types: [],
			},
			preventDefault,
			stopImmediatePropagation,
		} as unknown as ClipboardEvent;

		const pasteListener = listeners.get("paste");
		expect(pasteListener).toBeDefined();
		pasteListener?.(pasteEvent);

		expect(onWrite).not.toHaveBeenCalled();
		expect(preventDefault).not.toHaveBeenCalled();
		expect(stopImmediatePropagation).not.toHaveBeenCalled();
	});
});
