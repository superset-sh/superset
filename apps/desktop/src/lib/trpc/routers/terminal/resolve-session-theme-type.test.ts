import { describe, expect, it, mock } from "bun:test";
import type { ThemeState } from "main/lib/app-state/schemas";
import { resolveTerminalThemeType } from "./theme-type";

function createThemeState(params: Partial<ThemeState>): ThemeState {
	return {
		activeThemeId: "dark",
		customThemes: [],
		...params,
	};
}

describe("session terminal theme type (#5314)", () => {
	it("reproduces the bug: a 'system' app theme ignores the OS preference when the OS appearance is not supplied", () => {
		// This is exactly how the terminal router resolved the theme type when the
		// renderer did not pass an explicit themeType (e.g. host-side respawn /
		// cold restore): it forwarded only the persisted theme state and never the
		// OS appearance. With activeThemeId === "system" and no systemPrefersDark,
		// resolveTerminalThemeType falls back to its dark default — so the terminal
		// (and Claude Code's "auto" theme via COLORFGBG) stays dark even when the
		// user's OS, and therefore the Superset app, is in light mode.
		const result = resolveTerminalThemeType({
			persistedThemeState: createThemeState({ activeThemeId: "system" }),
		});

		// Bug: light OS user still gets "dark".
		expect(result).toBe("dark");
	});

	it("syncs with the OS appearance once it is supplied (the fix)", async () => {
		mock.module("electron", () => ({
			nativeTheme: { shouldUseDarkColors: false },
		}));

		const { resolveSessionTerminalThemeType } = await import(
			"./resolve-session-theme-type"
		);

		const result = resolveSessionTerminalThemeType({
			persistedThemeState: createThemeState({ activeThemeId: "system" }),
		});

		// OS is in light mode, so the terminal must resolve to light to match the app.
		expect(result).toBe("light");
	});

	it("follows a dark OS appearance for a 'system' app theme", async () => {
		mock.module("electron", () => ({
			nativeTheme: { shouldUseDarkColors: true },
		}));

		const { resolveSessionTerminalThemeType } = await import(
			"./resolve-session-theme-type"
		);

		expect(
			resolveSessionTerminalThemeType({
				persistedThemeState: createThemeState({ activeThemeId: "system" }),
			}),
		).toBe("dark");
	});

	it("still honors an explicitly requested theme type", async () => {
		mock.module("electron", () => ({
			nativeTheme: { shouldUseDarkColors: true },
		}));

		const { resolveSessionTerminalThemeType } = await import(
			"./resolve-session-theme-type"
		);

		expect(
			resolveSessionTerminalThemeType({
				requestedThemeType: "light",
				persistedThemeState: createThemeState({ activeThemeId: "system" }),
			}),
		).toBe("light");
	});
});
