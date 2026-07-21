import { describe, expect, it } from "bun:test";
import { wcagContrast } from "culori";
import { darkTheme, lightTheme, monokaiTheme } from "./built-in";
import { getEditorTheme } from "./editor-theme";
import type { TerminalColors, Theme } from "./types";

const tokyoNightTerminal: TerminalColors = {
	background: "#1a1b26",
	foreground: "#c0caf5",
	cursor: "#c0caf5",
	black: "#15161e",
	red: "#f7768e",
	green: "#9ece6a",
	yellow: "#e0af68",
	blue: "#7aa2f7",
	magenta: "#bb9af7",
	cyan: "#7dcfff",
	white: "#a9b1d6",
	brightBlack: "#414868",
	brightRed: "#f7768e",
	brightGreen: "#9ece6a",
	brightYellow: "#e0af68",
	brightBlue: "#7aa2f7",
	brightMagenta: "#bb9af7",
	brightCyan: "#7dcfff",
	brightWhite: "#c0caf5",
};

/**
 * Stock Tokyo Night, imported with no `editor.syntax` block. brightBlack is the
 * ANSI "dim" slot (#414868 on #1a1b26 ≈ 1.9:1) — repro fixture for #5662.
 */
const tokyoNight: Theme = {
	id: "tokyo-night",
	name: "Tokyo Night",
	type: "dark",
	isCustom: true,
	ui: {
		background: "#1a1b26",
		foreground: "#c0caf5",
		card: "#1f2335",
		cardForeground: "#c0caf5",
		popover: "#1f2335",
		popoverForeground: "#c0caf5",
		primary: "#7aa2f7",
		primaryForeground: "#1a1b26",
		secondary: "#292e42",
		secondaryForeground: "#c0caf5",
		muted: "#292e42",
		mutedForeground: "#9aa5ce",
		accent: "#292e42",
		accentForeground: "#c0caf5",
		tertiary: "#16161e",
		tertiaryActive: "#292e42",
		destructive: "#f7768e",
		destructiveForeground: "#1a1b26",
		border: "#292e42",
		input: "#292e42",
		ring: "#7aa2f7",
		sidebar: "#16161e",
		sidebarForeground: "#c0caf5",
		sidebarPrimary: "#7aa2f7",
		sidebarPrimaryForeground: "#1a1b26",
		sidebarAccent: "#292e42",
		sidebarAccentForeground: "#c0caf5",
		sidebarBorder: "#292e42",
		sidebarRing: "#7aa2f7",
		chart1: "#f7768e",
		chart2: "#9ece6a",
		chart3: "#7aa2f7",
		chart4: "#e0af68",
		chart5: "#bb9af7",
		highlightMatch: "rgba(224, 175, 104, 0.25)",
		highlightActive: "rgba(224, 175, 104, 0.55)",
	},
	terminal: tokyoNightTerminal,
};

/** WCAG AA for normal text — the floor a comment must clear to stay readable. */
const MIN_READABLE_CONTRAST = 4.5;

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
		const brightGreen = darkTheme.terminal?.brightGreen;
		const brightRed = darkTheme.terminal?.brightRed;
		if (!brightGreen || !brightRed) {
			throw new Error(
				"Dark theme terminal colors must define bright diff accents",
			);
		}
		expect(editorTheme.colors.addition).toBe(brightGreen);
		expect(editorTheme.colors.deletion).toBe(brightRed);
		const explicitComment = darkTheme.editor?.syntax?.comment;
		expect(explicitComment).toBeDefined();
		if (!explicitComment) {
			throw new Error(
				"Dark theme should define an explicit editor comment color",
			);
		}
		expect(editorTheme.syntax.comment).toBe(explicitComment);
		expect(editorTheme.syntax.keyword).toBe(
			darkTheme.terminal?.magenta ?? darkTheme.ui.foreground,
		);
	});

	it("returns explicit editor overrides when present", () => {
		const baseEditorTheme = getEditorTheme(lightTheme);
		const editorTheme = getEditorTheme({
			...lightTheme,
			editor: {
				colors: {
					...baseEditorTheme.colors,
					background: "#f5f0e8",
				},
				syntax: {
					...baseEditorTheme.syntax,
					string: "#00875a",
				},
			},
		});

		expect(editorTheme.colors.background).toBe("#f5f0e8");
		expect(editorTheme.syntax.string).toBe("#00875a");
		expect(editorTheme.colors.searchActive).toBe(lightTheme.ui.highlightActive);
	});

	it("prefers ui colors when terminal colors are not provided", () => {
		const editorTheme = getEditorTheme({
			...darkTheme,
			terminal: undefined,
			editor: undefined,
			ui: {
				...darkTheme.ui,
				background: "#101820",
				foreground: "#f4efe6",
				card: "#18232d",
				border: "#355066",
				mutedForeground: "#8ea3b7",
				primary: "#e39b57",
				secondary: "#21303d",
				secondaryForeground: "#f4efe6",
				accent: "#25465f",
				destructive: "#ff6b6b",
				chart1: "#ff8f6b",
				chart2: "#4dd4ac",
				chart3: "#6bbcff",
				chart4: "#ffd166",
				chart5: "#c792ea",
				highlightMatch: "rgba(255, 209, 102, 0.28)",
				highlightActive: "rgba(107, 188, 255, 0.36)",
			},
		});

		expect(editorTheme.colors.background).toBe("#101820");
		expect(editorTheme.colors.foreground).toBe("#f4efe6");
		expect(editorTheme.colors.panel).toBe("#18232d");
		expect(editorTheme.colors.addition).toBe("#4dd4ac");
		expect(editorTheme.colors.deletion).toBe("#ff6b6b");
		expect(editorTheme.colors.modified).toBe("#6bbcff");
		expect(editorTheme.syntax.keyword).toBe("#e39b57");
		expect(editorTheme.syntax.comment).toBe("#8ea3b7");
		expect(editorTheme.syntax.string).toBe("#4dd4ac");
	});

	// Regression: #5662 — imported dark themes with no editor.syntax block fell
	// back to ANSI brightBlack for comments, which is dim by design and sits
	// well below readable contrast against the editor background.
	it("keeps comment readable for imported dark themes without editor.syntax", () => {
		const editorTheme = getEditorTheme(tokyoNight);

		// brightBlack alone would be unreadable (~1.9:1); guard must reject it.
		expect(tokyoNight.terminal?.brightBlack).toBeDefined();
		const brightBlackContrast = wcagContrast(
			tokyoNight.terminal?.brightBlack ?? "#000000",
			tokyoNight.ui.background,
		);
		expect(brightBlackContrast).toBeLessThan(MIN_READABLE_CONTRAST);

		expect(editorTheme.syntax.comment).not.toBe(
			tokyoNight.terminal?.brightBlack,
		);
		const commentContrast = wcagContrast(
			editorTheme.syntax.comment,
			editorTheme.colors.background,
		);
		expect(commentContrast).toBeGreaterThanOrEqual(MIN_READABLE_CONTRAST);
	});

	it("keeps a readable brightBlack as the comment color", () => {
		// A theme whose brightBlack already clears the contrast floor should be
		// respected rather than overridden.
		const readableBrightBlack = "#8a8f9e"; // ~5.0:1 on #1a1b26
		const theme: Theme = {
			...tokyoNight,
			terminal: {
				...tokyoNightTerminal,
				brightBlack: readableBrightBlack,
			},
		};

		const editorTheme = getEditorTheme(theme);
		expect(editorTheme.syntax.comment).toBe(readableBrightBlack);
	});

	it("pins Monokai's iconic comment color rather than letting the guard swap it", () => {
		const editorTheme = getEditorTheme(monokaiTheme);
		// #75715e is Monokai's signature comment color (~3.0:1) — below the guard
		// threshold, so it must be pinned explicitly on the theme.
		expect(editorTheme.syntax.comment).toBe("#75715e");
	});
});
