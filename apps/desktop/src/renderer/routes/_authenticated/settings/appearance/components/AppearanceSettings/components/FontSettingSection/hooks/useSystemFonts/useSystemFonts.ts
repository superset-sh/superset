import { useEffect, useState } from "react";

export type FontCategory = "nerd" | "mono" | "other";

export interface FontInfo {
	family: string;
	category: FontCategory;
}

/**
 * Fonts registered via @font-face that load from the OS at runtime
 * (not bundled in the app binary). Always shown in the dropdown on
 * supported platforms.
 */
const REGISTERED_FONTS: FontInfo[] = navigator.platform.startsWith("Mac")
	? [{ family: "SF Mono", category: "mono" }]
	: [];

const WELL_KNOWN_NERD: string[] = [
	"MesloLGM Nerd Font",
	"MesloLGS Nerd Font",
	"FiraCode Nerd Font",
	"Hack Nerd Font",
	"CaskaydiaCove Nerd Font",
	"CaskaydiaMono Nerd Font",
	"RobotoMono Nerd Font",
	"UbuntuMono Nerd Font",
	"SourceCodePro Nerd Font",
];

const WELL_KNOWN_MONO: string[] = [
	"Fira Code",
	"JetBrains Mono",
	"Menlo",
	"Monaco",
	"Consolas",
	"Hack",
	"Source Code Pro",
	"Cascadia Code",
	"Cascadia Mono",
	"IBM Plex Mono",
	"Inconsolata",
	"Roboto Mono",
	"Ubuntu Mono",
	"Victor Mono",
	"Iosevka",
	"Geist Mono",
	"Input Mono",
	"DejaVu Sans Mono",
	"Fira Mono",
	"PT Mono",
	"Noto Sans Mono",
	"Anonymous Pro",
	"Liberation Mono",
	"Droid Sans Mono",
	"Courier New",
];

const KNOWN_MONO_SET = new Set([
	...WELL_KNOWN_MONO,
	...WELL_KNOWN_NERD,
	...REGISTERED_FONTS.map((f) => f.family),
]);
const FONT_DISCOVERY_BATCH_SIZE = 16;
const FONT_DISCOVERY_START_DELAY_MS = 1000;

function yieldFontDiscoveryWork(): Promise<void> {
	if (typeof window.requestIdleCallback === "function") {
		return new Promise((resolve) => {
			window.requestIdleCallback(() => resolve(), { timeout: 100 });
		});
	}
	return new Promise((resolve) => setTimeout(resolve, 0));
}

// Reuse a single canvas context for all font measurements
let sharedCtx: CanvasRenderingContext2D | null = null;
function getCanvasCtx(): CanvasRenderingContext2D | null {
	if (!sharedCtx) {
		sharedCtx = document.createElement("canvas").getContext("2d");
	}
	return sharedCtx;
}

function isFontAvailable(family: string): boolean {
	const ctx = getCanvasCtx();
	if (!ctx) return false;

	const testString = "mmmmmmmmmmlli10OQ@#$%";
	const fallbacks = ["monospace", "sans-serif"] as const;

	for (const fallback of fallbacks) {
		ctx.font = `72px ${fallback}`;
		const fallbackWidth = ctx.measureText(testString).width;

		ctx.font = `72px "${family}", ${fallback}`;
		const testWidth = ctx.measureText(testString).width;

		if (Math.abs(testWidth - fallbackWidth) > 0.5) {
			return true;
		}
	}
	return false;
}

function classifyFont(family: string): FontCategory {
	if (/Nerd Font/i.test(family) || / NF$/i.test(family)) {
		return "nerd";
	}
	if (KNOWN_MONO_SET.has(family)) {
		return "mono";
	}
	return "other";
}

async function discoverSystemFonts(): Promise<FontInfo[]> {
	const result: FontInfo[] = [];
	let checked = 0;
	for (const family of WELL_KNOWN_NERD) {
		if (isFontAvailable(family)) {
			result.push({ family, category: "nerd" });
		}
		checked += 1;
		if (checked % FONT_DISCOVERY_BATCH_SIZE === 0) {
			await yieldFontDiscoveryWork();
		}
	}
	for (const family of WELL_KNOWN_MONO) {
		if (isFontAvailable(family)) {
			result.push({ family, category: "mono" });
		}
		checked += 1;
		if (checked % FONT_DISCOVERY_BATCH_SIZE === 0) {
			await yieldFontDiscoveryWork();
		}
	}
	return result;
}

let cachedFonts: FontInfo[] | null = null;
let fontDiscoveryPromise: Promise<FontInfo[]> | null = null;

async function loadSystemFonts(): Promise<FontInfo[]> {
	if (cachedFonts) return cachedFonts;
	if (fontDiscoveryPromise) return fontDiscoveryPromise;

	fontDiscoveryPromise = (async () => {
		await document.fonts.ready;
		await yieldFontDiscoveryWork();

		const result: FontInfo[] = [];
		const seen = new Set<string>();

		// Add registered @font-face fonts only if they loaded successfully.
		for (const font of REGISTERED_FONTS) {
			if (isFontAvailable(font.family)) {
				result.push(font);
				seen.add(font.family);
			}
		}

		for (const font of await discoverSystemFonts()) {
			if (!seen.has(font.family)) {
				seen.add(font.family);
				result.push(font);
			}
		}

		if (window.queryLocalFonts) {
			try {
				const fontData = await window.queryLocalFonts();
				let checked = 0;
				for (const fd of fontData) {
					if (seen.has(fd.family)) continue;
					seen.add(fd.family);

					result.push({ family: fd.family, category: classifyFont(fd.family) });

					checked += 1;
					if (checked % FONT_DISCOVERY_BATCH_SIZE === 0) {
						await yieldFontDiscoveryWork();
					}
				}
			} catch (err) {
				console.warn("[useSystemFonts] queryLocalFonts failed:", err);
			}
		}

		result.sort((a, b) => a.family.localeCompare(b.family));
		cachedFonts = result;
		return result;
	})();

	try {
		return await fontDiscoveryPromise;
	} catch (error) {
		fontDiscoveryPromise = null;
		throw error;
	}
}

export function useSystemFonts() {
	const [fonts, setFonts] = useState<FontInfo[]>(cachedFonts ?? []);
	const [isLoading, setIsLoading] = useState(cachedFonts === null);

	useEffect(() => {
		if (cachedFonts) return;

		let cancelled = false;
		const timeoutId = window.setTimeout(() => {
			void yieldFontDiscoveryWork()
				.then(() => {
					if (cancelled) return null;
					return loadSystemFonts();
				})
				.then((result) => {
					if (cancelled || !result) return;
					setFonts(result);
					setIsLoading(false);
				})
				.catch((err) => {
					if (!cancelled) setIsLoading(false);
					console.warn("[useSystemFonts] Font loading failed:", err);
				});
		}, FONT_DISCOVERY_START_DELAY_MS);
		return () => {
			cancelled = true;
			window.clearTimeout(timeoutId);
		};
	}, []);

	return { fonts, isLoading };
}
