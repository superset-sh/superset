import { describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
	getSystemThemeType,
	observeSystemThemeType,
	type SystemThemeDependencies,
} from "./system";

function createNativeThemeSource(initialDark: boolean) {
	const events = new EventEmitter();
	let isDark = initialDark;

	return {
		events,
		nativeTheme: {
			get shouldUseDarkColors() {
				return isDark;
			},
			on: (event: "updated", listener: () => void) => {
				events.on(event, listener);
			},
			off: (event: "updated", listener: () => void) => {
				events.off(event, listener);
			},
		},
		setDark(value: boolean) {
			isDark = value;
			events.emit("updated");
		},
	};
}

describe("system theme preference", () => {
	test("prefers native dark mode without consulting the macOS fallback", () => {
		const { nativeTheme } = createNativeThemeSource(true);
		const getUserDefault = mock(() => "");

		expect(
			getSystemThemeType({
				nativeTheme,
				systemPreferences: { getUserDefault },
				platform: "darwin",
			}),
		).toBe("dark");
		expect(getUserDefault).toHaveBeenCalledTimes(0);
	});

	test("uses the safe macOS preference fallback when nativeTheme is stale", () => {
		const { nativeTheme } = createNativeThemeSource(false);
		const getUserDefault = mock(() => "Dark");

		expect(
			getSystemThemeType({
				nativeTheme,
				systemPreferences: { getUserDefault },
				platform: "darwin",
			}),
		).toBe("dark");
		expect(getUserDefault).toHaveBeenCalledWith(
			"AppleInterfaceStyle",
			"string",
		);
	});

	test("falls back to nativeTheme when the macOS preference read fails", () => {
		const { nativeTheme } = createNativeThemeSource(false);

		expect(
			getSystemThemeType({
				nativeTheme,
				systemPreferences: {
					getUserDefault: () => {
						throw new Error("unavailable");
					},
				},
				platform: "darwin",
			}),
		).toBe("light");
	});

	test("does not consult the macOS fallback on other platforms", () => {
		const { nativeTheme } = createNativeThemeSource(false);
		const getUserDefault = mock(() => "Dark");

		expect(
			getSystemThemeType({
				nativeTheme,
				systemPreferences: { getUserDefault },
				platform: "linux",
			}),
		).toBe("light");
		expect(getUserDefault).toHaveBeenCalledTimes(0);
	});

	test("primes subscribers with current state and forwards runtime changes", () => {
		const source = createNativeThemeSource(true);
		const dependencies: SystemThemeDependencies = {
			nativeTheme: source.nativeTheme,
			systemPreferences: { getUserDefault: () => "" },
			platform: "darwin",
		};
		const values: string[] = [];

		const unsubscribe = observeSystemThemeType(
			(value) => values.push(value),
			dependencies,
		);

		expect(values).toEqual(["dark"]);
		source.setDark(false);
		expect(values).toEqual(["dark", "light"]);

		unsubscribe();
		source.setDark(true);
		expect(values).toEqual(["dark", "light"]);
	});
});
