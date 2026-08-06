import { externalUriSchemeLabel } from "shared/external-uri-scheme";

/**
 * Schemes safe to hand to Electron's `shell.openExternal` with no further
 * confirmation. Anything else (file:, javascript:, custom handlers, etc.) can
 * execute binaries or scripts via the OS URL handler registry.
 *
 * This is the gate for programmatic opens (OAuth flows, port forwarding,
 * window.open from an embedded browser). URIs the user explicitly activates
 * from app content go through `classifyExternalUri` +
 * `external.openExternalUri`, which can prompt for custom app schemes.
 */
const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:"]);

export function isSafeExternalUrl(url: string): boolean {
	if (typeof url !== "string" || url.length === 0) return false;
	try {
		return ALLOWED_SCHEMES.has(new URL(url).protocol);
	} catch {
		return false;
	}
}

export const externalUrlLogLabel = externalUriSchemeLabel;
