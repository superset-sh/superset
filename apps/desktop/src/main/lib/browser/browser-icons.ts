import { app } from "electron";
import { resolveBrowserAppPath } from "./chromium-profiles";

/**
 * Returns a data URL of a browser's macOS app icon (for the import picker), or
 * null when the browser isn't installed as an app or the icon can't be read.
 */
export async function getBrowserIconDataUrl(
	browserKey: string,
): Promise<string | null> {
	const appPath = resolveBrowserAppPath(browserKey);
	if (!appPath) return null;
	try {
		const icon = await app.getFileIcon(appPath, { size: "small" });
		return icon.isEmpty() ? null : icon.toDataURL();
	} catch {
		return null;
	}
}
