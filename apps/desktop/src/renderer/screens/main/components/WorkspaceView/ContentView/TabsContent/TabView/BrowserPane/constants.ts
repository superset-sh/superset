import type { ViewportPreset } from "shared/tabs-types";

export const DEFAULT_BROWSER_URL = "about:blank";

export const VIEWPORT_PRESETS: ViewportPreset[] = [
	{ name: "Desktop", width: 1440, height: 900 },
	{ name: "Tablet", width: 768, height: 1024 },
	{ name: "Mobile", width: 375, height: 812 },
];
