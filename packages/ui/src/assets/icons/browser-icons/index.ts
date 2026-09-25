import braveLogo from "./brave.svg";
import chromeLogo from "./chrome.svg";
import chromiumLogo from "./chromium.svg";
import cometLogo from "./comet.svg";
import diaLogo from "./dia.svg";
import edgeLogo from "./edge.svg";

/**
 * Official full-color browser logos, keyed by the browser key used in
 * chromium-profiles. Browsers without a bundled logo (Arc, Comet, Dia, …) are
 * absent and callers fall back to a generic icon.
 */
export const BROWSER_LOGOS: Record<string, string> = {
	chrome: chromeLogo,
	"chrome-beta": chromeLogo,
	"chrome-canary": chromeLogo,
	chromium: chromiumLogo,
	edge: edgeLogo,
	brave: braveLogo,
	comet: cometLogo,
	dia: diaLogo,
};

/** Returns the logo URL for a browser key, or undefined if none is bundled. */
export function getBrowserLogo(browserKey: string): string | undefined {
	return BROWSER_LOGOS[browserKey];
}
