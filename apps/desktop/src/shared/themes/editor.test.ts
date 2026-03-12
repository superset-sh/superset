import { describe, expect, it } from "bun:test";
import { darkTheme, lightTheme } from "./built-in";
import { getEditorTheme } from "./types";

describe("getEditorTheme", () => {
	it("derives editor colors from dark theme tokens", () => {
		const editorTheme = getEditorTheme(darkTheme);

		expect(editorTheme.colors.background).toBe(
			darkTheme.terminal?.background ?? darkTheme.ui.background,
		);
		expect(editorTheme.colors.foreground).toBe(
			darkTheme.terminal?.foreground ?? darkTheme.ui.foreground,
		);
		expect(editorTheme.colors.search).toBe(darkTheme.ui.highlightMatch);
		expect(editorTheme.colors.addition).toBe(darkTheme.terminal?.brightGreen);
		expect(editorTheme.colors.deletion).toBe(darkTheme.terminal?.brightRed);
		expect(editorTheme.syntax.keyword).toBe(
			darkTheme.terminal?.magenta ?? darkTheme.ui.foreground,
		);
	});

	it("returns explicit editor overrides when present", () => {
		const editorTheme = getEditorTheme({
			...lightTheme,
			editor: {
				colors: {
					...getEditorTheme(lightTheme).colors,
					background: "#f5f0e8",
				},
				syntax: {
					...getEditorTheme(lightTheme).syntax,
					string: "#00875a",
				},
			},
		});

		expect(editorTheme.colors.background).toBe("#f5f0e8");
		expect(editorTheme.syntax.string).toBe("#00875a");
		expect(editorTheme.colors.searchActive).toBe(lightTheme.ui.highlightActive);
	});
});
