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

export function externalUrlLogLabel(url: string): string {
	if (typeof url !== "string" || url.length === 0) return "empty";
	try {
		return new URL(url).protocol || "unknown:";
	} catch {
		return "malformed";
	}
}

/**
 * Wraps `shell.openExternal` with a scheme allowlist. Returns false and
 * refuses to dispatch when the URL is not http(s)/mailto. Catches
 * `shell.openExternal` rejections so callers can fire-and-forget without
 * risking an unhandled rejection in the Electron main process.
 */
export async function safeOpenExternal(url: string): Promise<boolean> {
	if (!isSafeExternalUrl(url)) {
		console.warn(
			"[safeOpenExternal] blocked unsafe URL scheme:",
			externalUrlLogLabel(url),
		);
		return false;
	}
	try {
		await shell.openExternal(url);
		return true;
	} catch (error) {
		console.error(
			"[safeOpenExternal] openExternal failed:",
			externalUrlLogLabel(url),
			error,
		);
		return false;
	}
}
