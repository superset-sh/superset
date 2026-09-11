import { loadActiveNotices } from "@/lib/client-notices";

const MINIMUM_MOBILE_VERSION = "1.0.0";
const MOBILE_PLATFORM = "ios";

/**
 * Version gate + server-driven notices for the mobile app, the same shape as
 * the desktop route. A notice reaches phones only when its `platforms`
 * names "ios": the table was written for desktop, and an untargeted notice
 * there carries desktop copy.
 */
export async function GET() {
	const notices = (await loadActiveNotices()).filter((notice) =>
		notice.platforms?.includes(MOBILE_PLATFORM),
	);
	return Response.json({
		minimumVersion: MINIMUM_MOBILE_VERSION,
		message: "Update Superset from the App Store to continue.",
		notices,
	});
}
