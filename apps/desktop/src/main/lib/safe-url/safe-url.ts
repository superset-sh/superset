import { shell } from "electron";

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

/**
 * Wraps `shell.openExternal` with a scheme allowlist. Returns false and
 * refuses to dispatch when the URL is not http(s)/mailto.
 */
export async function safeOpenExternal(url: string): Promise<boolean> {
	if (!isSafeExternalUrl(url)) {
		console.warn("[safeOpenExternal] blocked unsafe URL:", url);
		return false;
	}
	await shell.openExternal(url);
	return true;
}
