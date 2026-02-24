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

// Mock xterm browser-only modules to allow running in Node.js test environment
mock.module("@xterm/xterm", () => ({
	Terminal: class {
		textarea = null;
		element = null;
		paste = mock((_text: string) => {});
		getSelection = mock(() => "");
		attachCustomKeyEventHandler = mock(() => {});
		loadAddon = mock(() => {});
		open = mock(() => {});
		onData = mock(() => ({ dispose: () => {} }));
		onKey = mock(() => ({ dispose: () => {} }));
	},
}));
mock.module("@xterm/addon-webgl", () => ({
	WebglAddon: class {
		activate = mock(() => {});
	},
}));
mock.module("@xterm/addon-clipboard", () => ({
	ClipboardAddon: class {
		activate = mock(() => {});
	},
}));
mock.module("@xterm/addon-fit", () => ({
	FitAddon: class {
		activate = mock(() => {});
		fit = mock(() => {});
		proposeDimensions = mock(() => null);
	},
}));
mock.module("@xterm/addon-image", () => ({
	ImageAddon: class {
		activate = mock(() => {});
	},
}));
mock.module("@xterm/addon-ligatures", () => ({
	LigaturesAddon: class {
		activate = mock(() => {});
	},
}));
mock.module("@xterm/addon-unicode11", () => ({
	Unicode11Addon: class {
		activate = mock(() => {});
	},
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
	it("should call preventDefault when pasting an image-only clipboard (no text/plain)", () => {
		// Reproduce bug #1743: pasting an image on macOS shows the Preview app icon
		// because the handler returns early when there is no text/plain data, without
		// calling preventDefault(). This allows the default browser paste to proceed,
		// which renders the macOS Preview PNG icon instead of the actual image.

		const textarea = new EventTarget() as HTMLTextAreaElement;
		const xterm = {
			textarea,
			paste: mock((_text: string) => {}),
		} as unknown as XTerm;

		setupPasteHandler(xterm);

		let preventDefaultCalled = false;

		// Build a ClipboardEvent carrying only image data (no text/plain),
		// which is what macOS produces when copying a screenshot or image file.
		const clipboardData = {
			getData: (type: string) => (type === "text/plain" ? "" : ""),
			types: ["image/png"],
			files: [new File(["fake-png-bytes"], "image.png", { type: "image/png" })],
		};

		const pasteEvent = new Event("paste", {
			bubbles: true,
			cancelable: true,
		}) as ClipboardEvent;

		Object.defineProperty(pasteEvent, "clipboardData", {
			value: clipboardData,
		});

		Object.defineProperty(pasteEvent, "preventDefault", {
			value: () => {
				preventDefaultCalled = true;
			},
			writable: true,
		});

		textarea.dispatchEvent(pasteEvent);

		// Expected: handler prevents the default paste so macOS doesn't render
		// the Preview app icon. Currently FAILS because the handler returns early
		// when text/plain is empty, without calling preventDefault().
		expect(preventDefaultCalled).toBe(true);
	});
});
