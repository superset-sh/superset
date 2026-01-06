const MINIMUM_DESKTOP_VERSION = "0.0.39";

/**
 * Used to force the desktop app to update, in cases where we can't support
 * multiple versions of the desktop app easily.
 */
export async function GET() {
	return Response.json({
		minimumVersion: MINIMUM_DESKTOP_VERSION,
		message: "Please update to the latest version to continue.",
	});
}
