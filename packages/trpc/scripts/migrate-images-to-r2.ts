/**
 * One-off: copies every avatar and organization logo we host on Vercel Blob
 * into the public R2 bucket, generating the same variants a fresh upload
 * would, then points the row at the new URL.
 *
 * Only rows whose URL is on Vercel Blob are touched. The overwhelming
 * majority of `users.image` values are OAuth avatars on googleusercontent or
 * githubusercontent — those belong to Google and GitHub, are not ours to
 * rehost, and are left exactly as they are.
 *
 * Safe to rerun: a row already pointing at the static host is skipped. The
 * Blob objects are deliberately NOT deleted, so anything still holding an old
 * URL keeps working until a later teardown.
 *
 *   bun --env-file=.env packages/trpc/scripts/migrate-images-to-r2.ts
 *   bun --env-file=.env packages/trpc/scripts/migrate-images-to-r2.ts --dry-run
 */
import { db } from "@superset/db/client";
import { organizations, users } from "@superset/db/schema";
import { eq, like } from "drizzle-orm";
import sharp from "sharp";
import { publicBucket, putObject, staticBaseUrl } from "../src/lib/r2";

const DRY_RUN = process.argv.includes("--dry-run");
const BLOB_HOST = "%blob.vercel-storage%";
const VARIANTS = [
	{ name: "256", width: 256 },
	{ name: "64", width: 64 },
] as const;
const CACHE_CONTROL = "public, max-age=31536000, immutable";

function keyFor(prefix: string): string {
	return `${prefix}/${Math.random().toString(36).substring(2, 15)}`;
}

async function rehost(url: string, prefix: string): Promise<string | null> {
	const response = await fetch(url);
	if (!response.ok) {
		console.warn(`  ! ${response.status} fetching ${url}`);
		return null;
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	const contentType = response.headers.get("content-type") ?? "image/png";
	const pathname = keyFor(prefix);

	let rendered: { name: string; body: Buffer }[];
	try {
		rendered = await Promise.all(
			VARIANTS.map(async ({ name, width }) => ({
				name,
				body: await sharp(buffer)
					.rotate()
					.resize(width, width, { fit: "cover", withoutEnlargement: true })
					.webp({ quality: 82 })
					.toBuffer(),
			})),
		);
	} catch (error) {
		console.warn(`  ! not decodable as an image: ${url}`, error);
		return null;
	}

	if (DRY_RUN) return `${staticBaseUrl()}/${pathname}/256.webp`;

	await Promise.all([
		...rendered.map(({ name, body }) =>
			putObject({
				key: `${pathname}/${name}.webp`,
				body,
				contentType: "image/webp",
				bucket: publicBucket(),
				cacheControl: CACHE_CONTROL,
			}),
		),
		putObject({
			key: `${pathname}/original`,
			body: buffer,
			contentType,
			bucket: publicBucket(),
			cacheControl: CACHE_CONTROL,
		}),
	]);
	return `${staticBaseUrl()}/${pathname}/256.webp`;
}

let moved = 0;
let failed = 0;

const userRows = await db
	.select({ id: users.id, image: users.image })
	.from(users)
	.where(like(users.image, BLOB_HOST));
console.log(`users on Vercel Blob: ${userRows.length}`);
for (const row of userRows) {
	if (!row.image) continue;
	const next = await rehost(row.image, "avatars");
	if (!next) {
		failed += 1;
		continue;
	}
	if (!DRY_RUN) {
		await db.update(users).set({ image: next }).where(eq(users.id, row.id));
	}
	moved += 1;
}

const orgRows = await db
	.select({ id: organizations.id, logo: organizations.logo })
	.from(organizations)
	.where(like(organizations.logo, BLOB_HOST));
console.log(`organizations on Vercel Blob: ${orgRows.length}`);
for (const row of orgRows) {
	if (!row.logo) continue;
	const next = await rehost(row.logo, "logos");
	if (!next) {
		failed += 1;
		continue;
	}
	if (!DRY_RUN) {
		await db
			.update(organizations)
			.set({ logo: next })
			.where(eq(organizations.id, row.id));
	}
	moved += 1;
}

console.log(
	`${DRY_RUN ? "[dry run] " : ""}moved ${moved}, failed ${failed}. Blob objects left in place.`,
);
