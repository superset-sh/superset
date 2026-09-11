const MINIMUM_MOBILE_VERSION = "1.0.0";

export function GET() {
	return Response.json({
		minimumVersion: MINIMUM_MOBILE_VERSION,
		message: "Update Superset from the App Store to continue.",
	});
}
