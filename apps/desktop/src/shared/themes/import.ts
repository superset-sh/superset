import { z } from "zod";
import { builtInThemes, darkTheme, lightTheme } from "./built-in";
import { getEditorTheme } from "./editor-theme";
import { getDefaultTerminalColors, type Theme } from "./types";

const uiColorsSchema = z
	.object({
		background: z.string().optional(),
		foreground: z.string().optional(),
		card: z.string().optional(),
		cardForeground: z.string().optional(),
		popover: z.string().optional(),
		popoverForeground: z.string().optional(),
		primary: z.string().optional(),
		primaryForeground: z.string().optional(),
		secondary: z.string().optional(),
		secondaryForeground: z.string().optional(),
		muted: z.string().optional(),
		mutedForeground: z.string().optional(),
		accent: z.string().optional(),
		accentForeground: z.string().optional(),
		tertiary: z.string().optional(),
		tertiaryActive: z.string().optional(),
		destructive: z.string().optional(),
		destructiveForeground: z.string().optional(),
		border: z.string().optional(),
		input: z.string().optional(),
		ring: z.string().optional(),
		sidebar: z.string().optional(),
		sidebarForeground: z.string().optional(),
		sidebarPrimary: z.string().optional(),
		sidebarPrimaryForeground: z.string().optional(),
		sidebarAccent: z.string().optional(),
		sidebarAccentForeground: z.string().optional(),
		sidebarBorder: z.string().optional(),
		sidebarRing: z.string().optional(),
		chart1: z.string().optional(),
		chart2: z.string().optional(),
		chart3: z.string().optional(),
		chart4: z.string().optional(),
		chart5: z.string().optional(),
		highlightMatch: z.string().optional(),
		highlightActive: z.string().optional(),
		highlight: z.string().optional(),
		highlightForeground: z.string().optional(),
	})
	.passthrough();

const terminalColorsSchema = z
	.object({
		background: z.string().optional(),
		foreground: z.string().optional(),
		cursor: z.string().optional(),
		cursorAccent: z.string().optional(),
		selectionBackground: z.string().optional(),
		selectionForeground: z.string().optional(),
		black: z.string().optional(),
		red: z.string().optional(),
		green: z.string().optional(),
		yellow: z.string().optional(),
		blue: z.string().optional(),
		magenta: z.string().optional(),
		cyan: z.string().optional(),
		white: z.string().optional(),
		brightBlack: z.string().optional(),
		brightRed: z.string().optional(),
		brightGreen: z.string().optional(),
		brightYellow: z.string().optional(),
		brightBlue: z.string().optional(),
		brightMagenta: z.string().optional(),
		brightCyan: z.string().optional(),
		brightWhite: z.string().optional(),
	})
	.passthrough();

const editorColorsSchema = z
	.object({
		background: z.string().optional(),
		foreground: z.string().optional(),
		border: z.string().optional(),
		cursor: z.string().optional(),
		gutterBackground: z.string().optional(),
		gutterForeground: z.string().optional(),
		activeLine: z.string().optional(),
		selection: z.string().optional(),
		search: z.string().optional(),
		searchActive: z.string().optional(),
		panel: z.string().optional(),
		panelBorder: z.string().optional(),
		panelInputBackground: z.string().optional(),
		panelInputForeground: z.string().optional(),
		panelInputBorder: z.string().optional(),
		panelButtonBackground: z.string().optional(),
		panelButtonForeground: z.string().optional(),
		panelButtonBorder: z.string().optional(),
		diffBuffer: z.string().optional(),
		diffHover: z.string().optional(),
		diffSeparator: z.string().optional(),
		addition: z.string().optional(),
		deletion: z.string().optional(),
		modified: z.string().optional(),
	})
	.passthrough();

const editorSyntaxSchema = z
	.object({
		plainText: z.string().optional(),
		comment: z.string().optional(),
		keyword: z.string().optional(),
		string: z.string().optional(),
		number: z.string().optional(),
		functionCall: z.string().optional(),
		variableName: z.string().optional(),
		typeName: z.string().optional(),
		className: z.string().optional(),
		constant: z.string().optional(),
		regexp: z.string().optional(),
		tagName: z.string().optional(),
		attributeName: z.string().optional(),
		invalid: z.string().optional(),
	})
	.passthrough();

const editorThemeSchema = z
	.object({
		colors: editorColorsSchema.optional(),
		syntax: editorSyntaxSchema.optional(),
	})
	.passthrough();

const themeConfigSchema = z
	.object({
		id: z.string().optional(),
		name: z.string().optional(),
		author: z.string().optional(),
		version: z.string().optional(),
		description: z.string().optional(),
		type: z.enum(["dark", "light"]).optional(),
		ui: uiColorsSchema.optional(),
		terminal: terminalColorsSchema.optional(),
		colors: terminalColorsSchema.optional(),
		editor: editorThemeSchema.optional(),
	})
	.passthrough();

const RESERVED_THEME_IDS = new Set([
	"system",
	...builtInThemes.map((theme) => theme.id),
]);

function normalizeThemeId(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function isThemePack(value: unknown): value is {
	themes: unknown[];
} {
	return (
		typeof value === "object" &&
		value !== null &&
		"themes" in value &&
		Array.isArray((value as { themes?: unknown[] }).themes)
	);
}

function parseThemeEntry(
	entry: unknown,
	index: number,
): { ok: true; theme: Theme } | { ok: false; issue: string } {
	const parsedEntry = themeConfigSchema.safeParse(entry);
	if (!parsedEntry.success) {
		const issue = parsedEntry.error.issues[0]?.message ?? "Invalid theme shape";
		return { ok: false, issue: `Theme ${index + 1}: ${issue}` };
	}

	const config = parsedEntry.data;
	const rawName = config.name?.trim();
	const rawId = config.id?.trim() ?? rawName;
	if (!rawId) {
		return {
			ok: false,
			issue: `Theme ${index + 1}: Missing required "id" or "name"`,
		};
	}

	const id = normalizeThemeId(rawId);
	if (!id) {
		return {
			ok: false,
			issue: `Theme ${index + 1}: Theme ID resolved to empty value`,
		};
	}

	if (RESERVED_THEME_IDS.has(id)) {
		return {
			ok: false,
			issue: `Theme ${index + 1}: "${id}" is reserved by Superset`,
		};
	}

	const type = config.type ?? "dark";
	const baseTheme = type === "light" ? lightTheme : darkTheme;
	const terminalOverrides = config.terminal ?? config.colors;
	const editorOverrides = config.editor;
	const resolvedThemeBase: Theme = {
		id,
		name: rawName || config.id || id,
		author: config.author,
		version: config.version,
		description: config.description,
		type,
		ui: {
			...baseTheme.ui,
			...(config.ui ?? {}),
		},
		terminal: terminalOverrides
			? {
					...getDefaultTerminalColors(type),
					...terminalOverrides,
				}
			: undefined,
	};
	const baseEditorTheme = getEditorTheme(resolvedThemeBase);

	return {
		ok: true,
		theme: {
			...resolvedThemeBase,
			terminal: terminalOverrides
				? {
						...getDefaultTerminalColors(type),
						...terminalOverrides,
					}
				: undefined,
			editor: editorOverrides
				? {
						colors: {
							...baseEditorTheme.colors,
							...(editorOverrides.colors ?? {}),
						},
						syntax: {
							...baseEditorTheme.syntax,
							...(editorOverrides.syntax ?? {}),
						},
					}
				: undefined,
		},
	};
}

export type ThemeConfigParseResult =
	| { ok: false; error: string }
	| { ok: true; themes: Theme[]; issues: string[] };

/**
 * Parse user-supplied theme config JSON.
 * Supports:
 * - a single theme object
 * - an array of theme objects
 * - an object with `{ themes: [...] }`
 */
export function parseThemeConfigFile(content: string): ThemeConfigParseResult {
	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(content);
	} catch {
		return { ok: false, error: "Invalid JSON file" };
	}

	const entries = Array.isArray(parsedJson)
		? parsedJson
		: isThemePack(parsedJson)
			? parsedJson.themes
			: [parsedJson];

	if (entries.length === 0) {
		return { ok: false, error: "No themes found in file" };
	}

	const themes: Theme[] = [];
	const issues: string[] = [];

	for (const [index, entry] of entries.entries()) {
		const parsedEntry = parseThemeEntry(entry, index);
		if (!parsedEntry.ok) {
			issues.push(parsedEntry.issue);
			continue;
		}
		themes.push(parsedEntry.theme);
	}

	if (themes.length === 0) {
		return {
			ok: false,
			error: issues[0] ?? "No valid themes found in file",
		};
	}

	return { ok: true, themes, issues };
}
