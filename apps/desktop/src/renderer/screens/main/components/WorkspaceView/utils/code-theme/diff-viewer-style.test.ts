import { describe, expect, it } from "bun:test";
import { darkTheme, lightTheme } from "shared/themes/built-in";
import type { Theme } from "shared/themes/types";
import { getDiffViewerStyle } from "./diff-viewer-style";

/**
 * Regression test for #2684: Diff context text invisible on custom light themes.
 *
 * The @pierre/diffs CSS uses `light-dark(var(--diffs-light), var(--diffs-dark))`
 * to derive `--diffs-fg`. When a single Shiki theme is passed (custom themes),
 * the library only sets `--diffs-fg`/`--diffs-bg` but NOT `--diffs-light` or
 * `--diffs-dark`. Unstyled text spans fall through to `var(--diffs-light)` which
 * is undefined, making context lines invisible.
 *
 * The fix: getDiffViewerStyle must always set --diffs-light, --diffs-dark,
 * --diffs-light-bg, and --diffs-dark-bg so the CSS fallback chain works.
 */
describe("getDiffViewerStyle", () => {
	const fontSettings = { fontFamily: "Fira Code", fontSize: 14 };

	it("sets --diffs-light and --diffs-dark for custom light themes", () => {
		const customLight: Theme = {
			...lightTheme,
			id: "solarized-light",
			name: "Solarized Light",
			isBuiltIn: false,
			isCustom: true,
			ui: {
				...lightTheme.ui,
				foreground: "#657b83",
				background: "#fdf6e3",
			},
		};

		const style = getDiffViewerStyle(customLight, fontSettings) as Record<
			string,
			string
		>;

		expect(style["--diffs-light"]).toBeDefined();
		expect(style["--diffs-dark"]).toBeDefined();
		expect(style["--diffs-light-bg"]).toBeDefined();
		expect(style["--diffs-dark-bg"]).toBeDefined();

		// The foreground color must be set so unstyled text is visible
		expect(style["--diffs-light"]).toBeTruthy();
		expect(style["--diffs-dark"]).toBeTruthy();
	});

	it("sets --diffs-light and --diffs-dark for custom dark themes", () => {
		const customDark: Theme = {
			...darkTheme,
			id: "dracula",
			name: "Dracula",
			isBuiltIn: false,
			isCustom: true,
			ui: {
				...darkTheme.ui,
				foreground: "#f8f8f2",
				background: "#282a36",
			},
		};

		const style = getDiffViewerStyle(customDark, fontSettings) as Record<
			string,
			string
		>;

		expect(style["--diffs-light"]).toBeDefined();
		expect(style["--diffs-dark"]).toBeDefined();
		expect(style["--diffs-light-bg"]).toBeDefined();
		expect(style["--diffs-dark-bg"]).toBeDefined();
	});

	it("sets --diffs-light/--diffs-dark matching the editor foreground", () => {
		const style = getDiffViewerStyle(lightTheme, fontSettings) as Record<
			string,
			string
		>;

		// Both light and dark CSS vars should be set to the foreground color
		// so that light-dark() resolves correctly regardless of color-scheme
		expect(style["--diffs-light"]).toBe(style.color);
		expect(style["--diffs-dark"]).toBe(style.color);
	});

	it("applies font settings correctly", () => {
		const style = getDiffViewerStyle(lightTheme, fontSettings) as Record<
			string,
			string
		>;

		expect(style["--diffs-font-family"]).toBe("Fira Code");
		expect(style["--diffs-font-size"]).toBe("14px");
		expect(style["--diffs-line-height"]).toBe("21px");
	});
});
