import { describe, expect, test } from "bun:test";
import type { UIColors } from "shared/themes/types";
import { applyUIColors, clearThemeVariables } from "./css-variables";

// Minimal UIColors satisfying all required fields
const baseColors: UIColors = {
	background: "oklch(1 0 0)",
	foreground: "oklch(0.145 0 0)",
	card: "oklch(1 0 0)",
	cardForeground: "oklch(0.145 0 0)",
	popover: "oklch(1 0 0)",
	popoverForeground: "oklch(0.145 0 0)",
	primary: "oklch(0.205 0 0)",
	primaryForeground: "oklch(0.985 0 0)",
	secondary: "oklch(0.97 0 0)",
	secondaryForeground: "oklch(0.205 0 0)",
	muted: "oklch(0.97 0 0)",
	mutedForeground: "oklch(0.556 0 0)",
	accent: "oklch(0.97 0 0)",
	accentForeground: "oklch(0.205 0 0)",
	tertiary: "oklch(0.95 0.003 40)",
	tertiaryActive: "oklch(0.92 0.003 40)",
	destructive: "oklch(0.577 0.245 27.325)",
	destructiveForeground: "oklch(0.985 0 0)",
	border: "oklch(0.922 0 0)",
	input: "oklch(0.922 0 0)",
	ring: "oklch(0.708 0 0)",
	sidebar: "oklch(0.985 0 0)",
	sidebarForeground: "oklch(0.145 0 0)",
	sidebarPrimary: "oklch(0.205 0 0)",
	sidebarPrimaryForeground: "oklch(0.985 0 0)",
	sidebarAccent: "oklch(0.97 0 0)",
	sidebarAccentForeground: "oklch(0.205 0 0)",
	sidebarBorder: "oklch(0.922 0 0)",
	sidebarRing: "oklch(0.708 0 0)",
	chart1: "oklch(0.646 0.222 41.116)",
	chart2: "oklch(0.6 0.118 184.704)",
	chart3: "oklch(0.398 0.07 227.392)",
	chart4: "oklch(0.828 0.189 84.429)",
	chart5: "oklch(0.769 0.188 70.08)",
	highlightMatch: "rgba(255, 211, 61, 0.35)",
	highlightActive: "rgba(255, 150, 50, 0.55)",
};

describe("tab status background CSS variables", () => {
	test("tab status bg vars are not set when theme omits them", () => {
		applyUIColors(baseColors);

		expect(
			document.documentElement.style.getPropertyValue("--tab-review-bg"),
		).toBe("");
		expect(
			document.documentElement.style.getPropertyValue("--tab-working-bg"),
		).toBe("");
		expect(
			document.documentElement.style.getPropertyValue("--tab-permission-bg"),
		).toBe("");

		clearThemeVariables();
	});

	test("tabReviewBackground is applied as --tab-review-bg", () => {
		applyUIColors({
			...baseColors,
			tabReviewBackground: "rgba(80, 200, 120, 0.15)",
		});

		expect(
			document.documentElement.style.getPropertyValue("--tab-review-bg"),
		).toBe("rgba(80, 200, 120, 0.15)");

		clearThemeVariables();
	});

	test("tabWorkingBackground is applied as --tab-working-bg", () => {
		applyUIColors({
			...baseColors,
			tabWorkingBackground: "rgba(245, 180, 60, 0.10)",
		});

		expect(
			document.documentElement.style.getPropertyValue("--tab-working-bg"),
		).toBe("rgba(245, 180, 60, 0.10)");

		clearThemeVariables();
	});

	test("tabPermissionBackground is applied as --tab-permission-bg", () => {
		applyUIColors({
			...baseColors,
			tabPermissionBackground: "rgba(220, 80, 80, 0.15)",
		});

		expect(
			document.documentElement.style.getPropertyValue("--tab-permission-bg"),
		).toBe("rgba(220, 80, 80, 0.15)");

		clearThemeVariables();
	});

	test("clearThemeVariables removes all tab status bg vars", () => {
		applyUIColors({
			...baseColors,
			tabReviewBackground: "rgba(80, 200, 120, 0.15)",
			tabWorkingBackground: "rgba(245, 180, 60, 0.10)",
			tabPermissionBackground: "rgba(220, 80, 80, 0.15)",
		});

		clearThemeVariables();

		expect(
			document.documentElement.style.getPropertyValue("--tab-review-bg"),
		).toBe("");
		expect(
			document.documentElement.style.getPropertyValue("--tab-working-bg"),
		).toBe("");
		expect(
			document.documentElement.style.getPropertyValue("--tab-permission-bg"),
		).toBe("");
	});
});
