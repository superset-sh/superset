import { db } from "@superset/db";
import type { DesktopNotice } from "@superset/shared/desktop-notices";

const MINIMUM_DESKTOP_VERSION = "1.5.0";

/**
 * Version gate + server-driven notices for the desktop app.
 * `minimumVersion` force-updates old clients; `notices` drives targeted
 * popups without a desktop release (plans/20260720-remote-version-notices.md).
 */
export async function GET() {
	let notices: DesktopNotice[] = [];
	try {
		const now = new Date();
		const rows = await db.query.desktopNotices.findMany({
			where: (t, { and, eq, isNull, lte, gte, or }) =>
				and(
					eq(t.active, true),
					or(isNull(t.startsAt), lte(t.startsAt, now)),
					or(isNull(t.endsAt), gte(t.endsAt, now)),
				),
			orderBy: (t, { desc }) => desc(t.createdAt),
		});
		notices = rows.map((row) => ({
			id: row.id,
			severity: row.severity,
			trigger: row.trigger,
			minVersion: row.minVersion,
			maxVersion: row.maxVersion,
			platforms: row.platforms,
			channels: row.channels,
			title: row.title,
			body: row.body,
			cta:
				row.ctaLabel && row.ctaAction
					? { label: row.ctaLabel, action: row.ctaAction, url: row.ctaUrl }
					: null,
			dismissible: row.dismissible,
		}));
	} catch (error) {
		// keep the legacy minimumVersion gate alive even if the query fails
		console.error("[desktop/version] failed to load notices", error);
	}

	return Response.json({
		minimumVersion: MINIMUM_DESKTOP_VERSION,
		message: "Please update to the latest version to continue.",
		notices,
	});
}
