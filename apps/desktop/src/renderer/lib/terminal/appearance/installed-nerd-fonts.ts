/**
 * Detect Nerd Font families installed on this machine so the terminal font
 * stack can fall back to them for private-use-area icon glyphs (SUPER-1782).
 * The static NERD_FONT_FALLBACK_FAMILIES list only covers well-known names;
 * users install arbitrarily named patches ("0xProto Nerd Font",
 * "MesloLGLDZ Nerd Font Mono", …) that would otherwise never enter the stack.
 */

/** Nerd Fonts patcher family names: "X Nerd Font [Mono]" or short "X NF/NFM". */
const NERD_FONT_NAME_PATTERN = /nerd font/i;
const NERD_FONT_ABBREV_PATTERN = / NFM?$/i;
/** Proportional variants — their icons break monospace cell metrics. */
const PROPORTIONAL_VARIANT_PATTERN = /(?: propo| NFP)$/i;

export function isNerdFontFamily(family: string): boolean {
	if (PROPORTIONAL_VARIANT_PATTERN.test(family)) return false;
	return (
		NERD_FONT_NAME_PATTERN.test(family) || NERD_FONT_ABBREV_PATTERN.test(family)
	);
}

/** Keep the CSS stack bounded when a user has many Nerd Fonts installed. */
const MAX_DETECTED_FAMILIES = 8;

let cached: Promise<string[]> | null = null;

/**
 * Enumerate installed Nerd Font families via the Local Font Access API.
 * Resolves to [] when the API is unavailable or enumeration fails; the
 * result is cached for the renderer's lifetime (font installs mid-session
 * aren't visible to Chromium without a relaunch anyway).
 */
export function detectInstalledNerdFontFamilies(): Promise<string[]> {
	cached ??= (async () => {
		try {
			const query = window.queryLocalFonts;
			if (typeof query !== "function") return [];
			const fonts = await query.call(window);

			const seen = new Set<string>();
			const families: string[] = [];
			for (const font of fonts) {
				const family = font.family;
				if (!family) continue;
				const key = family.toLowerCase();
				if (seen.has(key)) continue;
				seen.add(key);
				if (isNerdFontFamily(family)) families.push(family);
			}
			// Mono variants first — their icons are drawn to fit a single cell.
			families.sort(
				(a, b) => Number(/mono$/i.test(b)) - Number(/mono$/i.test(a)),
			);
			return families.slice(0, MAX_DETECTED_FAMILIES);
		} catch {
			return [];
		}
	})();
	return cached;
}
