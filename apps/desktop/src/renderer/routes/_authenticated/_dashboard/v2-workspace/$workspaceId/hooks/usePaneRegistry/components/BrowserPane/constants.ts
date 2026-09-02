export const DEFAULT_BROWSER_URL = "about:blank";

export interface DevicePreset {
	id: string;
	label: string;
	width: number;
	height: number;
}

/** Common responsive-testing viewports, narrowest first (matches Chrome's device toolbar list). */
export const DEVICE_PRESETS: DevicePreset[] = [
	{ id: "iphone-se", label: "iPhone SE", width: 375, height: 667 },
	{ id: "iphone-14-pro", label: "iPhone 14 Pro", width: 393, height: 852 },
	{ id: "pixel-7", label: "Pixel 7", width: 412, height: 915 },
	{ id: "galaxy-s8", label: "Galaxy S8+", width: 360, height: 740 },
	{ id: "ipad-air", label: "iPad Air", width: 820, height: 1180 },
	{ id: "responsive", label: "Responsive", width: 900, height: 600 },
];

export const DEFAULT_DEVICE_PRESET = DEVICE_PRESETS[0] as DevicePreset;
