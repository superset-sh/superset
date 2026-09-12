import { db } from "@superset/db/client";
import {
	attachments,
	files,
	pages,
	pageVersions,
	type SelectPage,
} from "@superset/db/schema";
import {
	fileOriginalKey,
	type PageManifest,
	type PageManifestAsset,
	pageManifestKey,
	pageThumbnailKey,
	signPageTicket,
} from "@superset/shared/usercontent";
import { and, asc, eq, inArray } from "drizzle-orm";
import { env } from "../../env";
import { deleteObjects, putObject } from "../../lib/r2";

// Expiry is rounded to a window boundary so identical claims give an
// identical ticket — and therefore an identical URL — within the window,
// letting every cache hold what it fetched. `exp = ceil(now/w)*w + w` keeps
// a ticket valid for at least one full window. The served alias can change,
// so it turns hourly; a pinned version is immutable, so it gets a day.
const SERVED_TICKET_WINDOW_SECONDS = 60 * 60;
const VERSION_TICKET_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * Rewrites the manifest the usercontent Worker serves from. Called after any
 * change to what a page serves or who may see it; idempotent, so a failed
 * write is repaired by the next caller.
 */
export async function writePageManifest(pageId: string): Promise<void> {
	const [page] = await db
		.select()
		.from(pages)
		.where(eq(pages.id, pageId))
		.limit(1);
	if (!page) return;

	const rows = await db
		.select({
			id: pageVersions.id,
			version: pageVersions.version,
			key: pageVersions.storageKey,
			contentType: pageVersions.contentType,
		})
		.from(pageVersions)
		.where(eq(pageVersions.pageId, pageId))
		.orderBy(asc(pageVersions.version));

	const assetsByVersion = new Map<string, Record<string, PageManifestAsset>>();
	if (rows.length > 0) {
		const assetRows = await db
			.select({
				versionId: attachments.parentId,
				path: attachments.path,
				fileId: files.id,
				contentType: files.contentType,
			})
			.from(attachments)
			.innerJoin(files, eq(files.id, attachments.fileId))
			.where(
				and(
					eq(attachments.parentKind, "page_version"),
					inArray(
						attachments.parentId,
						rows.map((row) => row.id),
					),
				),
			);
		for (const asset of assetRows) {
			if (asset.path === null) continue;
			const entry = assetsByVersion.get(asset.versionId) ?? {};
			entry[asset.path] = {
				key: fileOriginalKey(asset.fileId),
				contentType: asset.contentType,
			};
			assetsByVersion.set(asset.versionId, entry);
		}
	}

	const manifest: PageManifest = {
		v: 1,
		pageId,
		slug: page.slug,
		visibility: page.visibility,
		sharedVersion: page.sharedVersion,
		latestVersion: rows.at(-1)?.version ?? null,
		versions: Object.fromEntries(
			rows.map((row) => {
				const assets = assetsByVersion.get(row.id);
				return [
					String(row.version),
					{
						key: row.key,
						contentType: row.contentType,
						...(assets ? { assets } : {}),
					},
				];
			}),
		),
	};

	// The manifest is the Worker's authorization source, so its write gets a
	// short retry before the caller's error surfaces; a crash between the
	// database commit and this write is repaired by the next caller (durable
	// reconciliation is a recorded follow-up).
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			await putObject({
				key: pageManifestKey(pageId),
				body: JSON.stringify(manifest),
				contentType: "application/json",
				bucket: "private",
			});
			return;
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

export async function deletePageObjects({
	pageId,
	versions,
}: {
	pageId: string;
	versions: readonly { version: number; key: string }[];
}): Promise<void> {
	await deleteObjects([
		pageManifestKey(pageId),
		...versions.flatMap((row) => [
			row.key,
			pageThumbnailKey(pageId, row.version),
		]),
	]);
}

/**
 * A public page needs no ticket; anything narrower gets one bound to the
 * page and, when given, to a single version.
 */
export async function mintPageTicket(
	page: Pick<SelectPage, "id" | "visibility">,
	{ version, ttlSeconds }: { version?: number; ttlSeconds?: number } = {},
): Promise<string | undefined> {
	if (page.visibility === "everyone") return undefined;
	const now = Math.floor(Date.now() / 1000);
	const window =
		version !== undefined
			? VERSION_TICKET_WINDOW_SECONDS
			: SERVED_TICKET_WINDOW_SECONDS;
	// An explicit ttl (the thumbnail capture) is exact, not windowed.
	const exp =
		ttlSeconds !== undefined
			? now + ttlSeconds
			: Math.ceil(now / window) * window + window;
	return signPageTicket(env.USERCONTENT_TOKEN_SECRET, {
		pageId: page.id,
		...(version !== undefined ? { version } : {}),
		exp,
	});
}
