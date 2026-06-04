/**
 * Schemes safe to hand to Electron's `shell.openExternal`.
 * Anything else (file:, javascript:, custom handlers, etc.) can execute
 * binaries or scripts via the OS URL handler registry.
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

export function externalUrlLogLabel(url: string): string {
	if (typeof url !== "string" || url.length === 0) return "empty";
	try {
		return new URL(url).protocol || "unknown:";
	} catch {
		return "malformed";
	}
}
