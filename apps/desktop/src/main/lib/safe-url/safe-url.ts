import { shell } from "electron";
import { externalUrlLogLabel, isSafeExternalUrl } from "./scheme";

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
