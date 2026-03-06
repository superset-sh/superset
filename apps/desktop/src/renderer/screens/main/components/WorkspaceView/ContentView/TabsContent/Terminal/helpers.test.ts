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

const forwardAppHotkeyEventMock = mock(() => {});
let isAppHotkeyEventResult = false;

mock.module("renderer/stores/hotkeys", () => ({
	getHotkeyKeys: (id: string) => (id === "CLEAR_TERMINAL" ? "meta+k" : null),
	forwardAppHotkeyEvent: forwardAppHotkeyEventMock,
	isAppHotkeyEvent: () => isAppHotkeyEventResult,
}));

// Import after mocks are set up
const {
	blurTerminalInput,
	focusTerminalInput,
	getDefaultTerminalBg,
	getDefaultTerminalTheme,
	setupClickToMoveCursor,
	setupCopyHandler,
	setupFocusListener,
	setupKeyboardHandler,
	setupPasteHandler,
	setupResizeHandlers,
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
	beforeEach(() => {
		forwardAppHotkeyEventMock.mockClear();
		isAppHotkeyEventResult = false;
	});

	it("attaches and cleans up the custom key handler", () => {
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

		const cleanup = setupKeyboardHandler(xterm as unknown as XTerm);
		expect(captured.handler).toBeDefined();
		cleanup();
		expect(captured.handler).toBeDefined();
	});

	it("allows normal terminal typing through to ghostty-web", () => {
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

		setupKeyboardHandler(xterm as unknown as XTerm);

		const result = captured.handler?.({
			type: "keydown",
			key: "a",
			code: "KeyA",
			metaKey: false,
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
		} as KeyboardEvent);
		expect(result).toBe(false);
	});

	it("blocks the clear shortcut from reaching the terminal", () => {
		const captured: { handler: ((event: KeyboardEvent) => boolean) | null } = {
			handler: null,
		};
		const onClear = mock(() => {});
		const xterm = {
			attachCustomKeyEventHandler: (
				next: (event: KeyboardEvent) => boolean,
			) => {
				captured.handler = next;
			},
		};

		setupKeyboardHandler(xterm as unknown as XTerm, { onClear });

		const result = captured.handler?.({
			type: "keydown",
			key: "k",
			code: "KeyK",
			metaKey: true,
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
		} as KeyboardEvent);
		expect(result).toBe(true);
		expect(onClear).toHaveBeenCalledTimes(1);
	});

	it("forwards app hotkeys into the app layer and blocks terminal input", () => {
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

		isAppHotkeyEventResult = true;

		setupKeyboardHandler(xterm as unknown as XTerm);

		const preventDefault = mock(() => {});
		const stopPropagation = mock(() => {});
		const stopImmediatePropagation = mock(() => {});
		const event = {
			type: "keydown",
			key: "d",
			code: "KeyD",
			metaKey: true,
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
			preventDefault,
			stopPropagation,
			stopImmediatePropagation,
		} as unknown as KeyboardEvent;

		const result = captured.handler?.(event);
		expect(result).toBe(true);
		expect(preventDefault).toHaveBeenCalledTimes(1);
		expect(stopPropagation).toHaveBeenCalledTimes(1);
		expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
		expect(forwardAppHotkeyEventMock).toHaveBeenCalledWith(event);
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

describe("terminal focus helpers", () => {
	it("focusTerminalInput focuses the terminal and textarea", () => {
		const focusTerminal = mock(() => {});
		const focusTextarea = mock(() => {});
		const blurTextarea = mock(() => {});
		const xterm = {
			focus: focusTerminal,
			textarea: {
				focus: focusTextarea,
				blur: blurTextarea,
			},
		} as unknown as XTerm;

		focusTerminalInput(xterm);

		expect(focusTerminal).toHaveBeenCalledTimes(1);
		expect(focusTextarea).toHaveBeenCalledTimes(1);
	});

	it("blurTerminalInput blurs both ghostty root and textarea", () => {
		const blurTerminal = mock(() => {});
		const blurTextarea = mock(() => {});
		const xterm = {
			blur: blurTerminal,
			textarea: {
				focus: mock(() => {}),
				blur: blurTextarea,
			},
		} as unknown as XTerm;

		blurTerminalInput(xterm);

		expect(blurTerminal).toHaveBeenCalledTimes(1);
		expect(blurTextarea).toHaveBeenCalledTimes(1);
	});
});

describe("setupFocusListener", () => {
	it("listens on both the ghostty root and textarea", () => {
		const elementListeners = new Map<string, EventListener>();
		const textareaListeners = new Map<string, EventListener>();
		const onFocus = mock(() => {});
		const xterm = {
			element: {
				addEventListener: mock((eventName: string, listener: EventListener) => {
					elementListeners.set(eventName, listener);
				}),
				removeEventListener: mock((eventName: string) => {
					elementListeners.delete(eventName);
				}),
			},
			textarea: {
				focus: mock(() => {}),
				blur: mock(() => {}),
				addEventListener: mock((eventName: string, listener: EventListener) => {
					textareaListeners.set(eventName, listener);
				}),
				removeEventListener: mock((eventName: string) => {
					textareaListeners.delete(eventName);
				}),
			},
		} as unknown as XTerm;

		const cleanup = setupFocusListener(xterm, onFocus);

		elementListeners.get("focus")?.({} as Event);
		textareaListeners.get("focus")?.({} as Event);

		expect(onFocus).toHaveBeenCalledTimes(2);

		cleanup?.();
		expect(elementListeners.has("focus")).toBe(false);
		expect(textareaListeners.has("focus")).toBe(false);
	});
});

describe("setupClickToMoveCursor", () => {
	it("uses the rendered canvas bounds when translating click coordinates", () => {
		const clickListeners = new Map<string, EventListener>();
		const onWrite = mock(() => {});
		const canvas = {
			getBoundingClientRect: () => ({
				left: 10,
				top: 5,
				width: 200,
				height: 100,
			}),
		};
		const normalBuffer = { cursorX: 0, cursorY: 0, viewportY: 0 };
		const xterm = {
			element: {
				addEventListener: mock((eventName: string, listener: EventListener) => {
					clickListeners.set(eventName, listener);
				}),
				removeEventListener: mock((eventName: string) => {
					clickListeners.delete(eventName);
				}),
				querySelector: mock(() => canvas),
			},
			buffer: {
				active: normalBuffer,
				normal: normalBuffer,
			},
			hasSelection: mock(() => false),
			cols: 80,
			rows: 24,
			renderer: {
				getMetrics: () => ({ width: 10, height: 20 }),
			},
		} as unknown as XTerm;

		setupClickToMoveCursor(xterm, { onWrite });

		clickListeners.get("click")?.({
			button: 0,
			metaKey: false,
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
			clientX: 25,
			clientY: 10,
		} as MouseEvent);

		expect(onWrite).toHaveBeenCalledWith("\x1b[C");
	});
});

describe("setupResizeHandlers", () => {
	const originalResizeObserver = globalThis.ResizeObserver;
	const originalWindow = globalThis.window;

	afterEach(() => {
		globalThis.ResizeObserver = originalResizeObserver;
		globalThis.window = originalWindow;
	});

	it("forwards resize events without the old debounce delay", () => {
		let resizeCallback:
			| ((entries: ResizeObserverEntry[], observer: ResizeObserver) => void)
			| null = null;
		const observe = mock(() => {});
		const disconnect = mock(() => {});

		globalThis.ResizeObserver = class {
			constructor(callback: ResizeObserverCallback) {
				resizeCallback = callback;
			}

			observe = observe;
			disconnect = disconnect;
		} as unknown as typeof ResizeObserver;

		globalThis.window = {
			addEventListener: mock(() => {}),
			removeEventListener: mock(() => {}),
		} as unknown as Window & typeof globalThis;

		const onResize = mock(() => {});
		const container = {} as HTMLDivElement;
		const xterm = {
			buffer: {
				active: {
					baseY: 10,
					viewportY: 10,
				},
			},
		} as unknown as XTerm;

		const cleanup = setupResizeHandlers(container, xterm, onResize);

		if (resizeCallback) {
			(
				resizeCallback as (
					entries: ResizeObserverEntry[],
					observer: ResizeObserver,
				) => void
			)([], {} as ResizeObserver);
		}

		expect(onResize).toHaveBeenCalledWith(true);

		cleanup();
		expect(disconnect).toHaveBeenCalledTimes(1);
	});
});
