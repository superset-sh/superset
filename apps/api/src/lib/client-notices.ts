import { db } from "@superset/db";
import type { DesktopNotice } from "@superset/shared/desktop-notices";

export async function loadActiveNotices(): Promise<DesktopNotice[]> {
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
		return rows.map((row) => ({
			id: row.id,
			severity: row.severity,
			trigger: row.trigger,
			minVersion: row.minVersion,
			maxVersion: row.maxVersion,
			platforms: row.platforms,
			channels: row.channels,
			body: row.body,
			cta:
				row.ctaLabel && row.ctaAction
					? { label: row.ctaLabel, action: row.ctaAction, url: row.ctaUrl }
					: null,
			dismissible: row.dismissible,
		}));
	} catch (error) {
		console.error("[client-notices] failed to load notices", error);
		return [];
	}
}
