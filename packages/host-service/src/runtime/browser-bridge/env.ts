import type { BrowserBridgeConfig } from "../../types";

/**
 * Build the browser-bridge config from env, or undefined when either var is
 * absent (standalone hosts with no desktop app). Shared by every host entry
 * point so the URL+secret pairing is validated in one place.
 */
export function resolveBrowserBridgeFromEnv(env: {
	BROWSER_BRIDGE_URL?: string;
	BROWSER_BRIDGE_SECRET?: string;
}): BrowserBridgeConfig | undefined {
	if (!env.BROWSER_BRIDGE_URL || !env.BROWSER_BRIDGE_SECRET) return undefined;
	return { url: env.BROWSER_BRIDGE_URL, secret: env.BROWSER_BRIDGE_SECRET };
}
