/**
 * One-off: copies every page version from Vercel Blob into R2 at the key the
 * registry gives it (pages/<pageId>/versions/<n>/index.html), points the
 * version row at that key, then writes each page's manifest. Safe to rerun —
 * versions already in R2 are skipped, manifests are rewritten.
 *
 *   bun --env-file=.env packages/trpc/scripts/migrate-pages-to-r2.ts
 */
import { db } from "@superset/db/client";
import { pageVersions } from "@superset/db/schema";
import { pageVersionKey } from "@superset/shared/usercontent";
import { head } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { objectExists, putObject } from "../src/lib/r2";
import { writePageManifest } from "../src/router/page/storage";

const rows = await db
	.select({
		pageId: pageVersions.pageId,
		version: pageVersions.version,
		key: pageVersions.storageKey,
		contentType: pageVersions.contentType,
	})
	.from(pageVersions);

let copied = 0;
let skipped = 0;
for (const row of rows) {
	const key = pageVersionKey(row.pageId, row.version);
	if (await objectExists(key)) {
		skipped += 1;
	} else {
		// Until the row is repointed below, its key is still the Blob pathname.
		const { url } = await head(row.key);
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Blob fetch failed (${response.status}) for ${row.key}`);
		}
		await putObject({
			key,
			body: new Uint8Array(await response.arrayBuffer()),
			contentType: row.contentType,
		});
		copied += 1;
		console.log(`copied ${row.key} -> ${key}`);
	}
	if (row.key !== key) {
		await db
			.update(pageVersions)
			.set({ storageKey: key })
			.where(
				and(
					eq(pageVersions.pageId, row.pageId),
					eq(pageVersions.version, row.version),
				),
			);
	}
}

const pageIds = [...new Set(rows.map((row) => row.pageId))];
for (const pageId of pageIds) {
	await writePageManifest(pageId);
}

console.log(
	`done: ${copied} copied, ${skipped} already present, ${pageIds.length} manifests written`,
);
process.exit(0);
