import { loadActiveNotices } from "@/lib/client-notices";

const MINIMUM_DESKTOP_VERSION = "1.5.0";

/**
 * Version gate + server-driven notices for the desktop app.
 * `minimumVersion` force-updates old clients; `notices` drives targeted
 * popups without a desktop release (plans/done/20260720-remote-version-notices.md).
 */
export async function GET() {
	return Response.json({
		minimumVersion: MINIMUM_DESKTOP_VERSION,
		message: "Please update to the latest version to continue.",
		notices: await loadActiveNotices(),
	});
}
