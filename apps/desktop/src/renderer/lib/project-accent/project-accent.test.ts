import { describe, expect, test } from "bun:test";
import { PANES_ACCENT_VARS } from "@superset/panes";
import {
	clampAccentIntensity,
	DEFAULT_PROJECT_ACCENT_SETTINGS,
	isHexColor,
	mixHexColors,
	resolveProjectAccent,
	resolveSidebarProjectTint,
	tintTerminalTheme,
} from "./project-accent";

const RED = "#ef4444";

describe("isHexColor", () => {
	test("accepts only exact #rrggbb", () => {
		expect(isHexColor("#EF4444")).toBe(true);
		expect(isHexColor("#fff")).toBe(false);
		expect(isHexColor("#ef4444ff")).toBe(false);
		expect(isHexColor("default")).toBe(false);
		expect(isHexColor(null)).toBe(false);
	});
});

describe("mixHexColors", () => {
	test("blends channel-wise by amount", () => {
		expect(mixHexColors("#000000", "#ffffff", 0)).toBe("#000000");
		expect(mixHexColors("#000000", "#ffffff", 1)).toBe("#ffffff");
		expect(mixHexColors("#000000", "#ff0080", 0.5)).toBe("#800040");
	});

	test("clamps amount to 0–1", () => {
		expect(mixHexColors("#102030", "#ffffff", 2)).toBe("#ffffff");
		expect(mixHexColors("#102030", "#ffffff", -1)).toBe("#102030");
	});
});

describe("clampAccentIntensity", () => {
	test("rounds and clamps to 0–100, defaulting non-numbers", () => {
		expect(clampAccentIntensity(150)).toBe(100);
		expect(clampAccentIntensity(-3)).toBe(0);
		expect(clampAccentIntensity(33.6)).toBe(34);
		expect(clampAccentIntensity("40")).toBe(
			DEFAULT_PROJECT_ACCENT_SETTINGS.intensity,
		);
		expect(clampAccentIntensity(Number.NaN)).toBe(
			DEFAULT_PROJECT_ACCENT_SETTINGS.intensity,
		);
	});
});

describe("resolveProjectAccent", () => {
	test("is null without a valid color or when disabled", () => {
		expect(resolveProjectAccent(null, DEFAULT_PROJECT_ACCENT_SETTINGS)).toBe(
			null,
		);
		expect(resolveProjectAccent("#fff", DEFAULT_PROJECT_ACCENT_SETTINGS)).toBe(
			null,
		);
		expect(
			resolveProjectAccent(RED, {
				...DEFAULT_PROJECT_ACCENT_SETTINGS,
				enabled: false,
			}),
		).toBe(null);
	});

	test("emits a variable per enabled surface, scaled by intensity", () => {
		const accent = resolveProjectAccent(RED, {
			...DEFAULT_PROJECT_ACCENT_SETTINGS,
			intensity: 100,
		});
		const tint =
			"linear-gradient(rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.2))";
		expect(accent?.cssVars).toEqual({
			[PANES_ACCENT_VARS.tabBarTint]: tint,
			[PANES_ACCENT_VARS.activeTabAccent]: RED,
			[PANES_ACCENT_VARS.paneHeaderTint]: tint,
			[PANES_ACCENT_VARS.surfaceTint]: tint,
		});
		expect(accent?.terminalTint).toEqual({ color: RED, amount: 0.2 });
	});

	test("the surface tint matches the terminal blend", () => {
		const accent = resolveProjectAccent(RED, DEFAULT_PROJECT_ACCENT_SETTINGS);
		const amount = accent?.terminalTint?.amount;
		expect(accent?.cssVars[PANES_ACCENT_VARS.surfaceTint]).toBe(
			`linear-gradient(rgba(239, 68, 68, ${amount}), rgba(239, 68, 68, ${amount}))`,
		);
	});

	test("omits surfaces that are switched off", () => {
		const accent = resolveProjectAccent(RED, {
			...DEFAULT_PROJECT_ACCENT_SETTINGS,
			tabBar: false,
			paneHeaders: false,
			background: false,
		});
		expect(accent).toEqual({ cssVars: {}, terminalTint: null });
	});

	test("zero intensity leaves the background untouched", () => {
		const accent = resolveProjectAccent(RED, {
			...DEFAULT_PROJECT_ACCENT_SETTINGS,
			intensity: 0,
		});
		expect(accent?.terminalTint).toBe(null);
		expect(accent?.cssVars[PANES_ACCENT_VARS.surfaceTint]).toBeUndefined();
	});
});

describe("resolveSidebarProjectTint", () => {
	test("scales the fill by intensity", () => {
		expect(
			resolveSidebarProjectTint(RED, {
				...DEFAULT_PROJECT_ACCENT_SETTINGS,
				intensity: 100,
			}),
		).toBe("rgba(239, 68, 68, 0.3)");
		expect(
			resolveSidebarProjectTint(RED, {
				...DEFAULT_PROJECT_ACCENT_SETTINGS,
				intensity: 0,
			}),
		).toBe(null);
	});

	test("is null when switched off or without a color", () => {
		expect(
			resolveSidebarProjectTint(RED, {
				...DEFAULT_PROJECT_ACCENT_SETTINGS,
				sidebar: false,
			}),
		).toBe(null);
		expect(
			resolveSidebarProjectTint(RED, {
				...DEFAULT_PROJECT_ACCENT_SETTINGS,
				enabled: false,
			}),
		).toBe(null);
		expect(
			resolveSidebarProjectTint(null, DEFAULT_PROJECT_ACCENT_SETTINGS),
		).toBe(null);
	});
});

describe("tintTerminalTheme", () => {
	test("blends only the background", () => {
		const theme = { background: "#000000", foreground: "#ffffff" };
		expect(tintTerminalTheme(theme, { color: "#ffffff", amount: 0.5 })).toEqual(
			{ background: "#808080", foreground: "#ffffff" },
		);
	});

	test("returns the same theme when there is nothing to tint", () => {
		const theme = { background: "rgb(0, 0, 0)" };
		expect(tintTerminalTheme(theme, { color: RED, amount: 0.1 })).toBe(theme);
		const hexTheme = { background: "#000000" };
		expect(tintTerminalTheme(hexTheme, null)).toBe(hexTheme);
	});
});
