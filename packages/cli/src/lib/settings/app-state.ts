import { randomUUID } from "node:crypto";
import {
	existsSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CLIError } from "@superset/cli-framework";
import {
	builtInThemes,
	DEFAULT_THEME_ID,
	parseThemeConfigFile,
	type Theme,
} from "@superset/shared/themes";
import { notifyDesktopSettingsChanged } from "./notify";
import { getAppStatePath, getSupersetHomeDir } from "./paths";

export const SYSTEM_THEME_ID = "system";

// Mirrors the desktop UI's import limit (ThemeSection MAX_THEME_FILE_SIZE).
const MAX_THEME_FILE_SIZE = 256 * 1024;

export interface ThemeState {
	activeThemeId: string;
	customThemes: Theme[];
	systemLightThemeId?: string;
	systemDarkThemeId?: string;
}

const DEFAULT_THEME_STATE: ThemeState = {
	activeThemeId: DEFAULT_THEME_ID,
	customThemes: [],
	systemLightThemeId: "light",
	systemDarkThemeId: DEFAULT_THEME_ID,
};

type AppState = Record<string, unknown> & { themeState?: Partial<ThemeState> };

function readAppState(): AppState {
	const path = getAppStatePath();
	if (!existsSync(path)) {
		throw new CLIError(
			`Superset app state not found at ${path}`,
			"Launch the Superset desktop app once on this machine first.",
		);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		throw new CLIError(
			`Superset app state at ${path} is not valid JSON`,
			"The desktop app rewrites it on next launch; retry after opening the app.",
		);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new CLIError(`Superset app state at ${path} is not a JSON object`);
	}
	return parsed as AppState;
}

export function readThemeState(): ThemeState {
	const state = readAppState().themeState;
	return {
		...DEFAULT_THEME_STATE,
		...state,
		customThemes: Array.isArray(state?.customThemes)
			? (state.customThemes as Theme[]).filter(
					(theme) =>
						typeof theme === "object" &&
						theme !== null &&
						typeof theme.id === "string",
				)
			: [],
	};
}

/**
 * Merge a patch into themeState, preserving every other field in
 * app-state.json (tabs, hotkeys, ...). The desktop app only reads this file
 * at startup and overwrites it while running, so callers must tell the user
 * to restart (and ideally quit cleanly first).
 */
export async function writeThemeState(
	patch: Partial<ThemeState>,
): Promise<{ themeState: ThemeState; refreshed: boolean }> {
	const appState = readAppState();
	const themeState = {
		...DEFAULT_THEME_STATE,
		...appState.themeState,
		...patch,
	} as ThemeState;
	const next = { ...appState, themeState };

	const path = getAppStatePath();
	const tempPath = join(
		getSupersetHomeDir(),
		`.${randomUUID()}.${process.pid}.app-state.tmp`,
	);
	writeFileSync(tempPath, JSON.stringify(next, null, 2), { mode: 0o600 });
	try {
		renameSync(tempPath, path);
	} catch (error) {
		try {
			unlinkSync(tempPath);
		} catch {}
		throw error;
	}
	// a running app re-reads themeState and applies it live (no restart)
	const refreshed = await notifyDesktopSettingsChanged();
	return { themeState, refreshed };
}

export interface ThemeChoice {
	id: string;
	name: string;
	type: string;
	source: "built-in" | "custom" | "system";
}

/** All ids valid for the active theme, including "system". */
export function listThemeChoices(themeState: ThemeState): ThemeChoice[] {
	return [
		{
			id: SYSTEM_THEME_ID,
			name: "System (follows OS appearance)",
			type: "auto",
			source: "system",
		},
		...builtInThemes.map((theme) => ({
			id: theme.id,
			name: theme.name,
			type: theme.type,
			source: "built-in" as const,
		})),
		...themeState.customThemes.map((theme) => ({
			id: theme.id,
			name: theme.name ?? theme.id,
			type: theme.type ?? "unknown",
			source: "custom" as const,
		})),
	];
}

export function requireThemeId(
	themeState: ThemeState,
	id: string,
	options: { allowSystem: boolean },
): string {
	const choices = listThemeChoices(themeState).filter(
		(choice) => options.allowSystem || choice.source !== "system",
	);
	if (!choices.some((choice) => choice.id === id)) {
		throw new CLIError(
			`Unknown theme: ${id}`,
			`Available: ${choices.map((choice) => choice.id).join(", ")}`,
		);
	}
	return id;
}

/**
 * Import themes from a JSON file using the same parser and normalization as
 * the desktop's Appearance UI (single theme, array, or `{ themes: [...] }`).
 * Re-importing an id replaces the existing custom theme.
 */
export async function importThemes(filePath: string): Promise<{
	imported: Theme[];
	issues: string[];
	themeState: ThemeState;
	refreshed: boolean;
}> {
	if (!existsSync(filePath)) {
		throw new CLIError(`Theme file not found: ${filePath}`);
	}
	if (statSync(filePath).size > MAX_THEME_FILE_SIZE) {
		throw new CLIError("Theme file too large", "Maximum size is 256 KB.");
	}
	const result = parseThemeConfigFile(readFileSync(filePath, "utf-8"));
	if (!result.ok) {
		throw new CLIError(`Could not import themes: ${result.error}`);
	}
	const state = readThemeState();
	const importedIds = new Set(result.themes.map((theme) => theme.id));
	const customThemes = [
		...state.customThemes.filter((theme) => !importedIds.has(theme.id)),
		// same stamp the desktop store applies on UI imports; the Appearance
		// dropdown groups themes by isCustom
		...result.themes.map((theme) => ({
			...theme,
			isCustom: true,
			isBuiltIn: false,
		})),
	];
	const { themeState, refreshed } = await writeThemeState({ customThemes });
	return {
		imported: result.themes,
		issues: result.issues,
		themeState,
		refreshed,
	};
}

/** Export a theme definition (built-in or custom) as pretty JSON. */
export function exportTheme(id: string): Theme {
	const theme =
		builtInThemes.find((candidate) => candidate.id === id) ??
		readThemeState().customThemes.find((candidate) => candidate.id === id);
	if (!theme) {
		throw new CLIError(
			`Unknown theme: ${id}`,
			"Run: superset settings theme list",
		);
	}
	// exports are starters for custom themes — don't let them claim isBuiltIn
	const { isBuiltIn: _isBuiltIn, ...rest } = theme;
	return rest;
}

/**
 * Remove a custom theme. Falls back to the default theme (or default system
 * mappings) anywhere the removed theme was referenced.
 */
export async function removeCustomTheme(
	id: string,
): Promise<{ themeState: ThemeState; refreshed: boolean }> {
	const state = readThemeState();
	if (!state.customThemes.some((theme) => theme.id === id)) {
		const customIds = state.customThemes.map((theme) => theme.id);
		throw new CLIError(
			`No custom theme with id: ${id}`,
			customIds.length
				? `Custom themes: ${customIds.join(", ")} (built-ins can't be removed)`
				: "There are no custom themes installed.",
		);
	}
	return await writeThemeState({
		customThemes: state.customThemes.filter((theme) => theme.id !== id),
		activeThemeId:
			state.activeThemeId === id ? DEFAULT_THEME_ID : state.activeThemeId,
		systemLightThemeId:
			state.systemLightThemeId === id ? "light" : state.systemLightThemeId,
		systemDarkThemeId:
			state.systemDarkThemeId === id
				? DEFAULT_THEME_ID
				: state.systemDarkThemeId,
	});
}
