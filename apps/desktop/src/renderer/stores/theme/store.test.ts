import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SystemThemeType } from "lib/trpc/routers/system";

type SystemThemeObserver = {
	onData: (themeType: SystemThemeType) => void;
	onError: (error: unknown) => void;
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
mock.module("../../lib/trpc-client", () => ({
	electronTrpcClient: {
		system: {
			themePreference: {
				subscribe: defaultSubscribe,
			},
		},
	},
}));
mock.module("../../lib/trpc-storage", () => ({
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
});
