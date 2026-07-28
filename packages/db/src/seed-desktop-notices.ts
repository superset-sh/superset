import { db } from "./client";
import { desktopNotices, type InsertDesktopNotice } from "./schema";

/**
 * Seeds example desktop_notices rows to QA the DB → API → client path (the
 * command palette "Preview notice" commands cover UI-only QA). Local dev only.
 *
 * Usage: NODE_ENV=development bun run packages/db/src/seed-desktop-notices.ts
 */

const EXAMPLES: InsertDesktopNotice[] = [
	{
		severity: "warning",
		trigger: "immediate",
		maxVersion: "1.99.0",
		body: "### Heads up: v2.0 has breaking changes\n\nThe next update changes how workspaces sync. Local projects keep working, but cloud mirrors will need re-linking once after you update.\n\n- [What's changing in v2.0](https://superset.sh/changelog)\n- Nothing to do until you update",
		ctaLabel: "Update now",
		ctaAction: "install-update",
		dismissible: true,
		active: true,
	},
	{
		severity: "warning",
		trigger: "pre-update",
		maxVersion: "1.99.0",
		body: "**Before you update**\n\nv2.0 changes how workspaces sync — cloud mirrors need re-linking once after the update. [Details](https://superset.sh/changelog)",
		dismissible: true,
		active: true,
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
		.returning({ id: desktopNotices.id, trigger: desktopNotices.trigger });
	for (const row of inserted) {
		console.log(`Seeded notice ${row.id} (${row.trigger})`);
	}
}

seedDesktopNotices()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
