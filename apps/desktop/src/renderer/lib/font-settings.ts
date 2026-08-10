import type { ElectronRouterOutputs } from "./electron-trpc";

export const FONT_SETTINGS_QUERY_KEY = [
	"electron",
	"settings",
	"getFontSettings",
] as const;

export type FontSettings = ElectronRouterOutputs["settings"]["getFontSettings"];
