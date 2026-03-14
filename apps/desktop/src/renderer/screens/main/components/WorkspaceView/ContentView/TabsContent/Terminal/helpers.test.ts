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

// Mock hotkeys store and shared hotkeys to avoid null state errors in keyboard handler tests
mock.module("renderer/stores/hotkeys", () => ({
	getHotkeyKeys: mock(() => null),
	isAppHotkeyEvent: mock(() => false),
}));
mock.module("shared/hotkeys", () => ({
	getCurrentPlatform: mock(() => "mac"),
	hotkeyFromKeyboardEvent: mock(() => null),
	isTerminalReservedEvent: mock(() => false),
	matchesHotkeyEvent: mock(() => false),
}));

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
	setupCopyHandler,
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

describe("setupCopyHandler", () => {
	const originalNavigator = globalThis.navigator;

	afterEach(() => {
		globalThis.navigator = originalNavigator;
	});

	function createXtermStub(selection: string) {
		const listeners = new Map<string, EventListener>();
		const element = {
			addEventListener: mock((eventName: string, listener: EventListener) => {
				listeners.set(eventName, listener);
			}),
			removeEventListener: mock((eventName: string) => {
				listeners.delete(eventName);
			}),
		} as unknown as HTMLElement;
		const xterm = {
			element,
			getSelection: mock(() => selection),
		} as unknown as XTerm;
		return { xterm, listeners };
	}

	it("trims trailing whitespace and writes to clipboardData when available", () => {
		const { xterm, listeners } = createXtermStub("foo   \nbar  ");
		setupCopyHandler(xterm);

		const preventDefault = mock(() => {});
		const setData = mock(() => {});
		const copyEvent = {
			preventDefault,
			clipboardData: { setData },
		} as unknown as ClipboardEvent;

		const copyListener = listeners.get("copy");
		expect(copyListener).toBeDefined();
		copyListener?.(copyEvent);

		expect(preventDefault).toHaveBeenCalled();
		expect(setData).toHaveBeenCalledWith("text/plain", "foo\nbar");
	});

	it("prefers clipboardData path over navigator.clipboard fallback", () => {
		const { xterm, listeners } = createXtermStub("foo   \nbar  ");
		const writeText = mock(() => Promise.resolve());

		// @ts-expect-error - mocking navigator for tests
		globalThis.navigator = { clipboard: { writeText } };

		setupCopyHandler(xterm);

		const preventDefault = mock(() => {});
		const setData = mock(() => {});
		const copyEvent = {
			preventDefault,
			clipboardData: { setData },
		} as unknown as ClipboardEvent;

		const copyListener = listeners.get("copy");
		expect(copyListener).toBeDefined();
		copyListener?.(copyEvent);

		expect(preventDefault).toHaveBeenCalled();
		expect(setData).toHaveBeenCalledWith("text/plain", "foo\nbar");
		expect(writeText).not.toHaveBeenCalled();
	});

	it("falls back to navigator.clipboard.writeText when clipboardData is missing", () => {
		const { xterm, listeners } = createXtermStub("foo   \nbar  ");
		const writeText = mock(() => Promise.resolve());

		// @ts-expect-error - mocking navigator for tests
		globalThis.navigator = { clipboard: { writeText } };

		setupCopyHandler(xterm);

		const preventDefault = mock(() => {});
		const copyEvent = {
			preventDefault,
			clipboardData: null,
		} as unknown as ClipboardEvent;

		const copyListener = listeners.get("copy");
		expect(copyListener).toBeDefined();
		copyListener?.(copyEvent);

		expect(preventDefault).not.toHaveBeenCalled();
		expect(writeText).toHaveBeenCalledWith("foo\nbar");
	});

	it("does not throw when clipboardData is missing and navigator.clipboard is unavailable", () => {
		const { xterm, listeners } = createXtermStub("foo   \nbar  ");

		// @ts-expect-error - mocking navigator for tests
		globalThis.navigator = {};

		setupCopyHandler(xterm);

		const copyEvent = {
			preventDefault: mock(() => {}),
			clipboardData: null,
		} as unknown as ClipboardEvent;

		const copyListener = listeners.get("copy");
		expect(copyListener).toBeDefined();
		expect(() => copyListener?.(copyEvent)).not.toThrow();
	});
});

describe("setupKeyboardHandler - optionAsMeta", () => {
	const originalNavigator = globalThis.navigator;

	afterEach(() => {
		globalThis.navigator = originalNavigator;
	});

	function createHandler(options: Parameters<typeof setupKeyboardHandler>[1]) {
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

		setupKeyboardHandler(xterm as unknown as XTerm, options);
		return captured;
	}

	it("sends ESC+letter when optionAsMeta is enabled on macOS", () => {
		const onWrite = mock(() => {});
		const optionAsMetaRef = { current: true };
		const captured = createHandler({ onWrite, optionAsMetaRef });

		const result = captured.handler?.({
			type: "keydown",
			key: "p",
			code: "KeyP",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
		} as KeyboardEvent);

		expect(result).toBe(false);
		expect(onWrite).toHaveBeenCalledWith("\x1bp");
	});

	it("does NOT intercept Option+letter when optionAsMeta is disabled", () => {
		const onWrite = mock(() => {});
		const optionAsMetaRef = { current: false };
		const captured = createHandler({ onWrite, optionAsMetaRef });

		const result = captured.handler?.({
			type: "keydown",
			key: "p",
			code: "KeyP",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
		} as KeyboardEvent);

		expect(result).toBe(true);
		expect(onWrite).not.toHaveBeenCalled();
	});

	it("Option+Left/Right send Alt-modified CSI sequences when optionAsMeta is on", () => {
		const onWrite = mock(() => {});
		const optionAsMetaRef = { current: true };
		const captured = createHandler({ onWrite, optionAsMetaRef });

		captured.handler?.({
			type: "keydown",
			key: "ArrowLeft",
			code: "ArrowLeft",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
		} as KeyboardEvent);
		captured.handler?.({
			type: "keydown",
			key: "ArrowRight",
			code: "ArrowRight",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
		} as KeyboardEvent);

		// Alt-modified CSI sequences for TUI compat (Zellij, tmux)
		expect(onWrite).toHaveBeenCalledWith("\x1b[1;3D");
		expect(onWrite).toHaveBeenCalledWith("\x1b[1;3C");
	});

	it("Option+Left/Right send ESC+b/ESC+f when optionAsMeta is off", () => {
		const onWrite = mock(() => {});
		const optionAsMetaRef = { current: false };
		const captured = createHandler({ onWrite, optionAsMetaRef });

		captured.handler?.({
			type: "keydown",
			key: "ArrowLeft",
			code: "ArrowLeft",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
		} as KeyboardEvent);
		captured.handler?.({
			type: "keydown",
			key: "ArrowRight",
			code: "ArrowRight",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
		} as KeyboardEvent);

		// Readline shortcuts for basic shell compat
		expect(onWrite).toHaveBeenCalledWith("\x1bb");
		expect(onWrite).toHaveBeenCalledWith("\x1bf");
	});

	it("uses event.code for layout independence (e.g., KeyO → \\x1bo)", () => {
		const onWrite = mock(() => {});
		const optionAsMetaRef = { current: true };
		const captured = createHandler({ onWrite, optionAsMetaRef });

		// On non-US keyboard layouts, event.key may be a unicode char (e.g., "ø")
		// but event.code should still be "KeyO"
		captured.handler?.({
			type: "keydown",
			key: "ø",
			code: "KeyO",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: false,
		} as KeyboardEvent);

		expect(onWrite).toHaveBeenCalledWith("\x1bo");
	});

	it("preserves Shift modifier: Option+Shift+P sends ESC+P (uppercase)", () => {
		const onWrite = mock(() => {});
		const optionAsMetaRef = { current: true };
		const captured = createHandler({ onWrite, optionAsMetaRef });

		captured.handler?.({
			type: "keydown",
			key: "P",
			code: "KeyP",
			altKey: true,
			metaKey: false,
			ctrlKey: false,
			shiftKey: true,
		} as KeyboardEvent);

		expect(onWrite).toHaveBeenCalledWith("\x1bP");
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
