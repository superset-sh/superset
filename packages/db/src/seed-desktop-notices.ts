import { db } from "./client";
import { desktopNotices, type InsertDesktopNotice } from "./schema";

/**
 * Seeds example desktop_notices rows for QA (local dev only). Rows are
 * inserted inactive except the examples below; flip `active` in the DB to
 * show/hide them — no deploy needed.
 *
 * Usage: NODE_ENV=development bun run packages/db/src/seed-desktop-notices.ts
 */

const EXAMPLES: InsertDesktopNotice[] = [
	{
		severity: "warning",
		trigger: "immediate",
		maxVersion: "1.99.0",
		title: "Heads up: v2.0 has breaking changes",
		body: "The next update changes how workspaces sync. Local projects keep working, but cloud mirrors will need re-linking once after you update.\n\n- [What's changing in v2.0](https://superset.sh/changelog)\n- Nothing to do until you update",
		ctaLabel: "Update now",
		ctaAction: "install-update",
		dismissible: true,
		active: true,
	},
	{
		severity: "info",
		trigger: "immediate",
		title: "v2.1 ships next week",
		body: "A faster terminal, new agent presets, and workspace search are coming in v2.1. Your app will update automatically.",
		ctaLabel: "Read the changelog",
		ctaAction: "open-url",
		ctaUrl: "https://superset.sh/changelog",
		dismissible: true,
		active: false,
	},
	{
		severity: "warning",
		trigger: "pre-update",
		maxVersion: "1.99.0",
		title: "Before you update",
		body: "v2.0 changes how workspaces sync — cloud mirrors need re-linking once after the update. [Details](https://superset.sh/changelog)",
		dismissible: true,
		active: true,
	},
	{
		severity: "info",
		trigger: "post-update",
		minVersion: "1.16.0",
		title: "What's new in 1.16",
		body: "**Server-driven notices** — like this one — plus a faster changes panel and terminal fixes.\n\n[Full changelog](https://superset.sh/changelog)",
		ctaLabel: "See the changelog",
		ctaAction: "open-url",
		ctaUrl: "https://superset.sh/changelog",
		dismissible: true,
		active: false,
	},
	{
		severity: "blocking",
		trigger: "immediate",
		maxVersion: "0.9.0",
		title: "Update required",
		body: "This version of Superset is no longer supported. Update to continue — your workspaces and terminals are safe.",
		ctaLabel: "Install & restart",
		ctaAction: "install-update",
		dismissible: false,
		active: false,
	},
];

async function seedDesktopNotices(): Promise<void> {
	if (process.env.NODE_ENV !== "development") {
		throw new Error(
			"seed-desktop-notices is local-dev only; run with NODE_ENV=development",
		);
	}

	const existing = await db.query.desktopNotices.findMany();
	if (existing.length > 0) {
		console.log(
			`desktop_notices already has ${existing.length} rows — skipping seed`,
		);
		return;
	}

	const inserted = await db
		.insert(desktopNotices)
		.values(EXAMPLES)
		.returning({ id: desktopNotices.id, title: desktopNotices.title });
	for (const row of inserted) {
		console.log(`Seeded notice ${row.id}: ${row.title}`);
	}
}

seedDesktopNotices()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
