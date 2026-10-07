import { PANES_ACCENT_VARS } from "@superset/panes";
import type { ITheme } from "@xterm/xterm";

export interface ProjectAccentSettings {
	enabled: boolean;
	tabBar: boolean;
	paneHeaders: boolean;
	terminal: boolean;
	/** 0–100; scales every tint between none and its surface's maximum. */
	intensity: number;
}

export const DEFAULT_PROJECT_ACCENT_SETTINGS: ProjectAccentSettings = {
	enabled: true,
	tabBar: true,
	paneHeaders: true,
	terminal: true,
	intensity: 40,
};

const TAB_BAR_MAX_ALPHA = 0.3;
const PANE_HEADER_MAX_ALPHA = 0.25;
const TERMINAL_MAX_MIX = 0.2;

export interface TerminalTint {
	color: string;
	/** 0–1 share of `color` blended into the terminal background. */
	amount: number;
}

export interface ProjectAccent {
	cssVars: Record<string, string>;
	terminalTint: TerminalTint | null;
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Exact `#rrggbb` only; shorthand and alpha forms count as unset. */
export function isHexColor(color: string | null | undefined): color is string {
	return !!color && HEX_COLOR_PATTERN.test(color);
}

function parseHexColor(hex: string): [number, number, number] {
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	];
}

export function hexToRgba(hex: string, alpha: number): string {
	const [r, g, b] = parseHexColor(hex);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixHexColors(
	base: string,
	tint: string,
	amount: number,
): string {
	const weight = Math.min(Math.max(amount, 0), 1);
	const baseChannels = parseHexColor(base);
	const tintChannels = parseHexColor(tint);
	return `#${baseChannels
		.map((channel, i) =>
			Math.round(channel + ((tintChannels[i] ?? channel) - channel) * weight)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

export function clampAccentIntensity(intensity: unknown): number {
	if (typeof intensity !== "number" || !Number.isFinite(intensity)) {
		return DEFAULT_PROJECT_ACCENT_SETTINGS.intensity;
	}
	return Math.min(Math.max(Math.round(intensity), 0), 100);
}

function flatTint(color: string, alpha: number): string {
	const rgba = hexToRgba(color, alpha);
	return `linear-gradient(${rgba}, ${rgba})`;
}

export function resolveProjectAccent(
	color: string | null | undefined,
	settings: ProjectAccentSettings,
): ProjectAccent | null {
	if (!settings.enabled || !isHexColor(color)) return null;
	const scale = clampAccentIntensity(settings.intensity) / 100;
	const cssVars: Record<string, string> = {};
	if (settings.tabBar) {
		cssVars[PANES_ACCENT_VARS.tabBarTint] = flatTint(
			color,
			TAB_BAR_MAX_ALPHA * scale,
		);
		cssVars[PANES_ACCENT_VARS.activeTabAccent] = color;
	}
	if (settings.paneHeaders) {
		cssVars[PANES_ACCENT_VARS.paneHeaderTint] = flatTint(
			color,
			PANE_HEADER_MAX_ALPHA * scale,
		);
	}
	const terminalTint =
		settings.terminal && scale > 0
			? { color, amount: TERMINAL_MAX_MIX * scale }
			: null;
	return { cssVars, terminalTint };
}

export function tintTerminalTheme(
	theme: ITheme,
	tint: TerminalTint | null,
): ITheme {
	if (!tint || !isHexColor(theme.background)) return theme;
	return {
		...theme,
		background: mixHexColors(theme.background, tint.color, tint.amount),
	};
}
