/**
 * One-off: copies every avatar and organization logo we host on Vercel Blob
 * into the public R2 bucket, generating the same variants a fresh upload
 * would, then points the row at the new URL.
 *
 * Only rows on Vercel Blob are touched. Nearly every `users.image` is an OAuth
 * avatar on googleusercontent or githubusercontent — those belong to Google
 * and GitHub, are not ours to rehost, and are left exactly as they are.
 *
 * Safe to rerun and safe to interrupt: each row is independent, a row whose
 * URL changed under us is skipped rather than overwritten, and failures are
 * counted rather than aborting the run. The Blob objects are deliberately NOT
 * deleted, so anything still holding an old URL keeps working.
 *
 *   bun --env-file=.env packages/trpc/scripts/migrate-images-to-r2.ts
 *   bun --env-file=.env packages/trpc/scripts/migrate-images-to-r2.ts --dry-run
 */
import { db } from "@superset/db/client";
import { organizations, users } from "@superset/db/schema";
import { and, eq, like } from "drizzle-orm";
import sharp from "sharp";
import { deleteObjects } from "../src/lib/r2";
import {
	generateImagePathname,
	imageUrlFor,
	putImageVariants,
	variantKeys,
} from "../src/lib/upload";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Our one Vercel Blob store, matched exactly rather than by suffix: every
 * Vercel customer's objects share the `.blob.vercel-storage.com` parent, so a
 * suffix test would happily rehost somebody else's URL that landed in a row.
 */
const BLOB_HOST = "ka6mxqeko8bmbqtb.public.blob.vercel-storage.com";
const BLOB_LIKE = "%blob.vercel-storage%";

/**
 * The SQL filter is a substring match, so it also matches a URL that merely
 * contains that text. Anything fetched here is fetched by the migration
 * runner, so the host is parsed and checked before a request is made.
 */
function isOurBlobUrl(raw: string): boolean {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	return url.protocol === "https:" && url.hostname === BLOB_HOST;
}

type Rehosted = { url: string; pathname: string };

async function rehost(url: string, prefix: string): Promise<Rehosted | null> {
	if (!isOurBlobUrl(url)) {
		console.warn(`  ! not a Vercel Blob URL, skipped: ${url}`);
		return null;
	}
	const response = await fetch(url, { redirect: "error" });
	if (!response.ok) {
		console.warn(`  ! ${response.status} fetching ${url}`);
		return null;
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	const pathname = generateImagePathname({ prefix });
	if (DRY_RUN) {
		// Decode without writing, so an object we cannot read is counted here
		// rather than discovered halfway through the real run.
		await sharp(buffer).metadata();
		return { url: imageUrlFor(pathname), pathname };
	}
	return { url: await putImageVariants({ buffer, pathname }), pathname };
}

/**
 * Removes the variants written for a row that then moved out from under us.
 * Without this, every skipped or failed row leaves two unreferenced objects
 * in the public bucket that nothing will ever look for again.
 */
async function discard(pathname: string): Promise<void> {
	if (DRY_RUN) return;
	await deleteObjects(variantKeys(pathname), { bucket: "public" }).catch(
		(error) => console.warn(`  ! orphaned variants at ${pathname}`, error),
	);
}

let moved = 0;
let skipped = 0;
let failed = 0;

const userRows = await db
	.select({ id: users.id, image: users.image })
	.from(users)
	.where(like(users.image, BLOB_LIKE));
console.log(`users on Vercel Blob: ${userRows.length}`);
for (const row of userRows) {
	if (!row.image) continue;
	let written: Rehosted | null = null;
	try {
		written = await rehost(row.image, `user/${row.id}/avatar`);
		if (!written) {
			failed += 1;
			continue;
		}
		if (!DRY_RUN) {
			// Guarded on the URL we read: a row the owner changed while this ran
			// keeps their newer image instead of being reverted to ours.
			const updated = await db
				.update(users)
				.set({ image: written.url })
				.where(and(eq(users.id, row.id), eq(users.image, row.image)))
				.returning({ id: users.id });
			if (updated.length === 0) {
				await discard(written.pathname);
				skipped += 1;
				continue;
			}
		}
		moved += 1;
	} catch (error) {
		console.warn(`  ! user ${row.id}`, error);
		if (written) await discard(written.pathname);
		failed += 1;
	}
}

const orgRows = await db
	.select({ id: organizations.id, logo: organizations.logo })
	.from(organizations)
	.where(like(organizations.logo, BLOB_LIKE));
console.log(`organizations on Vercel Blob: ${orgRows.length}`);
for (const row of orgRows) {
	if (!row.logo) continue;
	let written: Rehosted | null = null;
	try {
		written = await rehost(row.logo, `organization/${row.id}/logo`);
		if (!written) {
			failed += 1;
			continue;
		}
		if (!DRY_RUN) {
			const updated = await db
				.update(organizations)
				.set({ logo: written.url })
				.where(
					and(eq(organizations.id, row.id), eq(organizations.logo, row.logo)),
				)
				.returning({ id: organizations.id });
			if (updated.length === 0) {
				await discard(written.pathname);
				skipped += 1;
				continue;
			}
		}
		moved += 1;
	} catch (error) {
		console.warn(`  ! organization ${row.id}`, error);
		if (written) await discard(written.pathname);
		failed += 1;
	}
}

console.log(
	`${DRY_RUN ? "[dry run] " : ""}moved ${moved}, skipped ${skipped} (changed under us), failed ${failed}. Blob objects left in place.`,
);

// A partial backfill must not look like a clean one to whoever runs it.
if (failed > 0) process.exit(1);
