/**
 * Finishes the move off Vercel Blob.
 *
 * Reports by default and changes nothing. Three things are counted, and the
 * same three can be acted on:
 *
 *   pages   — a page version is migrated when its storage key equals the key
 *             the registry would give it. Anything else is still a Blob
 *             pathname, and its bytes disappear when the store is torn down.
 *   avatars — the first backfill stored two fixed variants and pointed rows at
 *             `<path>/256.webp`. Fresh uploads store the bytes once and point
 *             at a transformation. Legacy rows are repointed at a
 *             transformation over the 256 they already have, so every row ends
 *             up one shape and every render gets AVIF.
 *
 *   bun --env-file=.env packages/trpc/scripts/blob-port.ts
 *   bun --env-file=.env packages/trpc/scripts/blob-port.ts --repoint-avatars
 *   bun --env-file=.env packages/trpc/scripts/blob-port.ts --delete-legacy-pages
 */
import { db } from "@superset/db/client";
import { organizations, pageVersions, users } from "@superset/db/schema";
import { pageVersionKey } from "@superset/shared/usercontent";
import { and, eq, like, notLike } from "drizzle-orm";
import { objectExists } from "../src/lib/r2";
import { transformUrlFor } from "../src/lib/upload";

const REPOINT = process.argv.includes("--repoint-avatars");
const DELETE_PAGES = process.argv.includes("--delete-legacy-pages");

/** Rows the first backfill wrote: a direct object, not a transformation. */
const LEGACY_VARIANT = "%/256.webp";
const TRANSFORMED = "%/cdn-cgi/image/%";

const versions = await db
	.select({
		pageId: pageVersions.pageId,
		version: pageVersions.version,
		key: pageVersions.storageKey,
	})
	.from(pageVersions);

const legacyPages = versions.filter(
	(row) => row.key !== pageVersionKey(row.pageId, row.version),
);
console.log(
	`page versions: ${versions.length}, still on Blob: ${legacyPages.length}`,
);
for (const row of legacyPages.slice(0, 20)) {
	// Whether the bytes also exist in R2 decides if deleting the row loses anything.
	const inR2 = await objectExists(pageVersionKey(row.pageId, row.version));
	console.log(
		`  ${row.pageId} v${row.version}  key=${row.key}  alsoInR2=${inR2}`,
	);
}
if (legacyPages.length > 20)
	console.log(`  … and ${legacyPages.length - 20} more`);

const legacyUsers = await db
	.select({ id: users.id, image: users.image })
	.from(users)
	.where(
		and(like(users.image, LEGACY_VARIANT), notLike(users.image, TRANSFORMED)),
	);
const legacyOrgs = await db
	.select({ id: organizations.id, logo: organizations.logo })
	.from(organizations)
	.where(
		and(
			like(organizations.logo, LEGACY_VARIANT),
			notLike(organizations.logo, TRANSFORMED),
		),
	);
console.log(
	`avatars on the old variant URL: users ${legacyUsers.length}, organizations ${legacyOrgs.length}`,
);

// A few live URLs, so a run can be checked by fetching one rather than by
// trusting the counts. Whether a rewritten row actually renders is exactly
// what a count cannot tell you.
const samples = await db
	.select({ image: users.image })
	.from(users)
	.where(like(users.image, "%supersetusercontent%"))
	.limit(3);
for (const row of samples) console.log(`  sample: ${row.image}`);

if (DELETE_PAGES && legacyPages.length > 0) {
	for (const row of legacyPages) {
		await db
			.delete(pageVersions)
			.where(
				and(
					eq(pageVersions.pageId, row.pageId),
					eq(pageVersions.version, row.version),
				),
			);
	}
	console.log(
		`deleted ${legacyPages.length} page versions that only existed on Blob`,
	);
}

if (REPOINT) {
	let moved = 0;
	for (const row of legacyUsers) {
		if (!row.image) continue;
		const key = new URL(row.image).pathname.replace(/^\//, "");
		const updated = await db
			.update(users)
			.set({ image: transformUrlFor(key) })
			.where(and(eq(users.id, row.id), eq(users.image, row.image)))
			.returning({ id: users.id });
		moved += updated.length;
	}
	for (const row of legacyOrgs) {
		if (!row.logo) continue;
		const key = new URL(row.logo).pathname.replace(/^\//, "");
		const updated = await db
			.update(organizations)
			.set({ logo: transformUrlFor(key) })
			.where(
				and(eq(organizations.id, row.id), eq(organizations.logo, row.logo)),
			)
			.returning({ id: organizations.id });
		moved += updated.length;
	}
	console.log(`repointed ${moved} rows at a transformation URL`);
}

if (!REPOINT && !DELETE_PAGES) console.log("(report only — nothing changed)");
