const MINIMUM_DESKTOP_VERSION = "0.0.44";

/**
 * Used to force the desktop app to update, in cases where we can't support
 * multiple versions of the desktop app easily.
 */
export async function GET() {
	return Response.json({
		minimumVersion: MINIMUM_DESKTOP_VERSION,
		message:
			"We've upgraded our authentication system. Please update to continue.",
	});
}
