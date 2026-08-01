import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SystemThemeType } from "lib/trpc/routers/system";
import { darkTheme, getTerminalColors, type Theme } from "shared/themes";

type SystemThemeObserver = {
	onData: (themeType: SystemThemeType) => void;
	onError: (error: unknown) => void;
	onComplete?: () => void;
};

const originalDocument = (globalThis as { document?: unknown }).document;
const originalLocalStorage = (globalThis as { localStorage?: unknown })
	.localStorage;
const originalWindow = (globalThis as { window?: unknown }).window;

const storage = new Map<string, string>();
const mockLocalStorage = {
	getItem: mock((key: string) => storage.get(key) ?? null),
	setItem: mock((key: string, value: string) => {
		storage.set(key, value);
	}),
	removeItem: mock((key: string) => {
		storage.delete(key);
	}),
	clear: mock(() => storage.clear()),
	key: mock((index: number) => Array.from(storage.keys())[index] ?? null),
	get length() {
		return storage.size;
	},
};

const matchMedia = mock(() => ({
	matches: false,
	addEventListener: mock(() => {}),
	removeEventListener: mock(() => {}),
}));
const setProperty = mock((_property: string, _value: string) => {});
const addClass = mock((_className: string) => {});
const removeClass = mock((_className: string) => {});

Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	writable: true,
	value: mockLocalStorage,
});
Object.defineProperty(globalThis, "window", {
	configurable: true,
	writable: true,
	value: {
		localStorage: mockLocalStorage,
		matchMedia,
	},
});
Object.defineProperty(globalThis, "document", {
	configurable: true,
	writable: true,
	value: {
		documentElement: {
			classList: {
				add: addClass,
				remove: removeClass,
			},
			style: {
				setProperty,
			},
		},
	},
});

const defaultUnsubscribe = mock(() => {});
const defaultSubscribe = mock(
	(_input: undefined, _observer: SystemThemeObserver) => ({
		unsubscribe: defaultUnsubscribe,
	}),
);

// The store starts its Electron subscription at module load. Mock both eager
// renderer dependencies before importing it so this test also runs from the
// repository root without the desktop test preload.
mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		system: {
			themePreference: {
				subscribe: defaultSubscribe,
			},
		},
	},
}));
mock.module("renderer/lib/trpc-storage", () => ({
	trpcThemeStorage: {
		getItem: mock(async () => null),
		setItem: mock(async () => {}),
		removeItem: mock(async () => {}),
	},
}));

const { SYSTEM_THEME_ID, startSystemThemeSync, useThemeStore } = await import(
	"./store"
);

function createThemeSubscription(initialThemeType?: SystemThemeType) {
	let observer: SystemThemeObserver | undefined;
	const unsubscribe = mock(() => {});
	const subscribe = mock((nextObserver: SystemThemeObserver) => {
		observer = nextObserver;
		if (initialThemeType) {
			nextObserver.onData(initialThemeType);
		}
		return { unsubscribe };
	});

	return {
		subscribe,
		unsubscribe,
		emit(themeType: SystemThemeType) {
			observer?.onData(themeType);
		},
		complete() {
			observer?.onComplete?.();
		},
	};
}

function createCustomDarkTheme(id: string, foreground: string): Theme {
	return {
		...darkTheme,
		id,
		name: id,
		isBuiltIn: false,
		isCustom: true,
		terminal: {
			...getTerminalColors(darkTheme),
			foreground,
		},
	};
}

beforeEach(() => {
	storage.clear();
	matchMedia.mockClear();
	setProperty.mockClear();
	addClass.mockClear();
	removeClass.mockClear();

	useThemeStore.setState({
		activeThemeId: "light",
		customThemes: [],
		systemLightThemeId: "light",
		systemDarkThemeId: "monokai",
		systemThemeType: null,
		activeTheme: null,
		terminalTheme: null,
	});
});

afterAll(() => {
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		writable: true,
		value: originalDocument,
	});
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		writable: true,
		value: originalLocalStorage,
	});
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		writable: true,
		value: originalWindow,
	});
	mock.restore();
});

describe("main-process system theme sync", () => {
	test("wins over a stale renderer matchMedia value and preserves Monokai", () => {
		useThemeStore.getState().setSystemThemeType("light");
		useThemeStore.getState().setTheme(SYSTEM_THEME_ID);
		expect(useThemeStore.getState().activeTheme?.id).toBe("light");

		const subscription = createThemeSubscription("dark");
		const stop = startSystemThemeSync(subscription.subscribe);

		expect(window.matchMedia).toHaveBeenCalledTimes(0);
		expect(useThemeStore.getState().activeThemeId).toBe(SYSTEM_THEME_ID);
		expect(useThemeStore.getState().activeTheme?.id).toBe("monokai");

		subscription.emit("light");
		expect(useThemeStore.getState().activeTheme?.id).toBe("light");

		stop();
		expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
	});

	test("records runtime OS changes without overriding an explicit theme", () => {
		useThemeStore.getState().setTheme("monokai");
		const subscription = createThemeSubscription("dark");
		const stop = startSystemThemeSync(subscription.subscribe);

		subscription.emit("light");

		expect(useThemeStore.getState().systemThemeType).toBe("light");
		expect(useThemeStore.getState().activeThemeId).toBe("monokai");
		expect(useThemeStore.getState().activeTheme?.id).toBe("monokai");

		stop();
	});

	test("keeps the last applied light theme until a delayed system snapshot arrives", () => {
		storage.set("theme-id", "light");
		storage.set("theme-type", "light");
		storage.set("theme-terminal", "cached-terminal-colors");
		useThemeStore.setState({
			activeThemeId: SYSTEM_THEME_ID,
			systemThemeType: null,
			activeTheme: null,
			terminalTheme: null,
		});

		useThemeStore.getState().initializeTheme();

		expect(useThemeStore.getState().systemThemeType).toBeNull();
		expect(useThemeStore.getState().activeTheme?.id).toBe("light");
		expect(localStorage.getItem("theme-terminal")).toBe(
			"cached-terminal-colors",
		);
		expect(setProperty).toHaveBeenCalledTimes(0);
		expect(addClass).toHaveBeenCalledTimes(0);

		const subscription = createThemeSubscription();
		const stop = startSystemThemeSync(subscription.subscribe);
		expect(useThemeStore.getState().activeTheme?.id).toBe("light");
		expect(localStorage.getItem("theme-terminal")).toBe(
			"cached-terminal-colors",
		);

		subscription.emit("light");
		expect(useThemeStore.getState().systemThemeType).toBe("light");
		expect(useThemeStore.getState().activeTheme?.id).toBe("light");
		expect(localStorage.getItem("theme-terminal")).not.toBe(
			"cached-terminal-colors",
		);

		stop();
	});

	test("applies an explicit persisted theme while system appearance is unknown", () => {
		useThemeStore.setState({
			activeThemeId: "monokai",
			systemThemeType: null,
			activeTheme: null,
			terminalTheme: null,
		});

		useThemeStore.getState().initializeTheme();

		expect(useThemeStore.getState().activeTheme?.id).toBe("monokai");
		expect(useThemeStore.getState().systemThemeType).toBeNull();
		expect(localStorage.getItem("theme-id")).toBe("monokai");
		expect(setProperty).toHaveBeenCalled();
	});

	test("keeps a cached custom System preview intact until the IPC prime", () => {
		const originalTheme = createCustomDarkTheme("cached-custom", "#111111");
		const editedTheme = createCustomDarkTheme("cached-custom", "#eeeeee");
		const originalTerminal = JSON.stringify(getTerminalColors(originalTheme));
		storage.set("theme-id", originalTheme.id);
		storage.set("theme-type", originalTheme.type);
		storage.set("theme-terminal", originalTerminal);
		useThemeStore.setState({
			activeThemeId: SYSTEM_THEME_ID,
			customThemes: [originalTheme],
			systemDarkThemeId: originalTheme.id,
			systemThemeType: null,
			activeTheme: null,
			terminalTheme: null,
		});
		useThemeStore.getState().initializeTheme();
		setProperty.mockClear();

		useThemeStore.getState().upsertCustomThemes([editedTheme]);

		expect(useThemeStore.getState().activeTheme).toEqual(originalTheme);
		expect(useThemeStore.getState().terminalTheme?.foreground).toBe("#111111");
		expect(localStorage.getItem("theme-id")).toBe(originalTheme.id);
		expect(localStorage.getItem("theme-terminal")).toBe(originalTerminal);
		expect(setProperty).toHaveBeenCalledTimes(0);

		useThemeStore.getState().setSystemThemeType("dark");

		expect(useThemeStore.getState().activeTheme).toEqual(editedTheme);
		expect(useThemeStore.getState().terminalTheme?.foreground).toBe("#eeeeee");
		expect(localStorage.getItem("theme-id")).toBe(editedTheme.id);
		expect(localStorage.getItem("theme-terminal")).toBe(
			JSON.stringify(getTerminalColors(editedTheme)),
		);
		expect(setProperty).toHaveBeenCalled();
	});

	test("keeps a removed cached custom System preview intact until the IPC prime", () => {
		const cachedTheme = createCustomDarkTheme("cached-custom", "#eeeeee");
		const cachedTerminal = JSON.stringify(getTerminalColors(cachedTheme));
		storage.set("theme-id", cachedTheme.id);
		storage.set("theme-type", cachedTheme.type);
		storage.set("theme-terminal", cachedTerminal);
		useThemeStore.setState({
			activeThemeId: SYSTEM_THEME_ID,
			customThemes: [cachedTheme],
			systemDarkThemeId: cachedTheme.id,
			systemThemeType: null,
			activeTheme: null,
			terminalTheme: null,
		});
		useThemeStore.getState().initializeTheme();
		setProperty.mockClear();

		useThemeStore.getState().removeCustomTheme(cachedTheme.id);

		expect(useThemeStore.getState().customThemes).toEqual([]);
		expect(useThemeStore.getState().activeTheme).toEqual(cachedTheme);
		expect(useThemeStore.getState().terminalTheme?.foreground).toBe("#eeeeee");
		expect(localStorage.getItem("theme-id")).toBe(cachedTheme.id);
		expect(localStorage.getItem("theme-terminal")).toBe(cachedTerminal);
		expect(setProperty).toHaveBeenCalledTimes(0);

		useThemeStore.getState().setSystemThemeType("dark");

		expect(useThemeStore.getState().activeTheme?.id).toBe("dark");
		expect(useThemeStore.getState().activeTheme?.id).not.toBe(cachedTheme.id);
		expect(useThemeStore.getState().terminalTheme?.foreground).not.toBe(
			"#eeeeee",
		);
		expect(localStorage.getItem("theme-id")).toBe("dark");
		expect(localStorage.getItem("theme-terminal")).toBe(
			JSON.stringify(getTerminalColors(darkTheme)),
		);
		expect(setProperty).toHaveBeenCalled();
	});

	test("retries when the initial subscribe call throws synchronously", () => {
		const originalSetTimeout = globalThis.setTimeout;
		const originalConsoleError = console.error;
		let runReconnect: (() => void) | undefined;
		const consoleError = mock(() => {});
		Object.defineProperty(globalThis, "setTimeout", {
			configurable: true,
			writable: true,
			value: mock((callback: () => void) => {
				runReconnect = callback;
				return 1;
			}),
		});
		console.error = consoleError;

		try {
			const unsubscribe = mock(() => {});
			const subscribe = mock(() => {
				if (subscribe.mock.calls.length === 1) {
					throw new Error("sync subscribe failure");
				}
				return { unsubscribe };
			});

			const stop = startSystemThemeSync(subscribe);
			expect(subscribe).toHaveBeenCalledTimes(1);
			expect(consoleError).toHaveBeenCalledTimes(1);
			expect(runReconnect).toBeDefined();

			runReconnect?.();
			expect(subscribe).toHaveBeenCalledTimes(2);

			stop();
			expect(unsubscribe).toHaveBeenCalledTimes(1);
		} finally {
			console.error = originalConsoleError;
			Object.defineProperty(globalThis, "setTimeout", {
				configurable: true,
				writable: true,
				value: originalSetTimeout,
			});
		}
	});

	test("keeps retrying when a reconnect subscribe call throws synchronously", () => {
		const originalSetTimeout = globalThis.setTimeout;
		const originalConsoleError = console.error;
		let runReconnect: (() => void) | undefined;
		const consoleError = mock(() => {});
		Object.defineProperty(globalThis, "setTimeout", {
			configurable: true,
			writable: true,
			value: mock((callback: () => void) => {
				runReconnect = callback;
				return 1;
			}),
		});
		console.error = consoleError;

		try {
			const observers: SystemThemeObserver[] = [];
			const unsubscribes = [mock(() => {}), mock(() => {})];
			const subscribe = mock((observer: SystemThemeObserver) => {
				observers.push(observer);
				if (subscribe.mock.calls.length === 2) {
					throw new Error("sync reconnect failure");
				}
				return {
					unsubscribe:
						unsubscribes[subscribe.mock.calls.length === 1 ? 0 : 1] ??
						mock(() => {}),
				};
			});
			const stop = startSystemThemeSync(subscribe);

			observers[0]?.onComplete?.();
			runReconnect?.();
			expect(subscribe).toHaveBeenCalledTimes(2);
			expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
			expect(consoleError).toHaveBeenCalledTimes(1);
			expect(runReconnect).toBeDefined();

			runReconnect?.();
			expect(subscribe).toHaveBeenCalledTimes(3);

			stop();
			expect(unsubscribes[1]).toHaveBeenCalledTimes(1);
		} finally {
			console.error = originalConsoleError;
			Object.defineProperty(globalThis, "setTimeout", {
				configurable: true,
				writable: true,
				value: originalSetTimeout,
			});
		}
	});

	test("reconnects a gracefully completed subscription and tears down handles", () => {
		const originalSetTimeout = globalThis.setTimeout;
		let runReconnect: (() => void) | undefined;
		Object.defineProperty(globalThis, "setTimeout", {
			configurable: true,
			writable: true,
			value: mock((callback: () => void) => {
				runReconnect = callback;
				return 1;
			}),
		});

		try {
			const observers: SystemThemeObserver[] = [];
			const unsubscribes = [mock(() => {}), mock(() => {})];
			const subscribe = mock((observer: SystemThemeObserver) => {
				observers.push(observer);
				return {
					unsubscribe: unsubscribes[observers.length - 1] ?? mock(() => {}),
				};
			});
			const stop = startSystemThemeSync(subscribe);

			observers[0]?.onComplete?.();
			expect(runReconnect).toBeDefined();
			runReconnect?.();

			expect(subscribe).toHaveBeenCalledTimes(2);
			expect(unsubscribes[0]).toHaveBeenCalledTimes(1);

			stop();
			expect(unsubscribes[1]).toHaveBeenCalledTimes(1);
		} finally {
			Object.defineProperty(globalThis, "setTimeout", {
				configurable: true,
				writable: true,
				value: originalSetTimeout,
			});
		}
	});
});
