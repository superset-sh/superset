import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SystemThemeType } from "lib/trpc/routers/system";
import { SYSTEM_THEME_ID, startSystemThemeSync, useThemeStore } from "./store";

type SystemThemeObserver = {
	onData: (themeType: SystemThemeType) => void;
	onError: (error: unknown) => void;
};

function createThemeSubscription(initialThemeType: SystemThemeType) {
	let observer: SystemThemeObserver | undefined;
	const unsubscribe = mock(() => {});
	const subscribe = mock((nextObserver: SystemThemeObserver) => {
		observer = nextObserver;
		nextObserver.onData(initialThemeType);
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
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: mock(() => ({
			matches: false,
			addEventListener: mock(() => {}),
			removeEventListener: mock(() => {}),
		})),
	});

	useThemeStore.setState({
		activeThemeId: "light",
		customThemes: [],
		systemLightThemeId: "light",
		systemDarkThemeId: "monokai",
		systemThemeType: "light",
		activeTheme: null,
		terminalTheme: null,
	});
});

describe("main-process system theme sync", () => {
	test("wins over a stale renderer matchMedia value and preserves Monokai", () => {
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
});
