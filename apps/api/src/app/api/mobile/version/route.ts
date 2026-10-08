const MINIMUM_MOBILE_VERSION = "1.0.0";

export function GET() {
	// Shipped 1.1.0 binaries compare this with semver during render, so anything
	// but MAJOR.MINOR.PATCH crashes them on launch; an error fails their check open.
	if (!/^\d+\.\d+\.\d+$/.test(MINIMUM_MOBILE_VERSION)) {
		return Response.json(
			{ error: "MINIMUM_MOBILE_VERSION is not MAJOR.MINOR.PATCH" },
			{ status: 500 },
		);
	}
	return Response.json({
		minimumVersion: MINIMUM_MOBILE_VERSION,
		message: "Update Superset from the App Store to continue.",
	});
}
