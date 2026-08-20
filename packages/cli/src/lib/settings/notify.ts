/**
 * Best-effort nudge to the running desktop app after a settings write: the
 * app's local notifications server re-reads external changes and refreshes
 * the UI live (see /settings-changed). Returns whether a running app
 * acknowledged — callers adapt their messaging. Failures (app not running,
 * older app version without the endpoint) are expected and silent.
 */
export async function notifyDesktopSettingsChanged(): Promise<boolean> {
	const port = process.env.DESKTOP_NOTIFICATIONS_PORT ?? "51741";
	try {
		const response = await fetch(`http://127.0.0.1:${port}/settings-changed`, {
			method: "POST",
			signal: AbortSignal.timeout(500),
		});
		return response.ok;
	} catch {
		return false;
	}
}
