import { TRPCError } from "@trpc/server";
import { env } from "../env";
import { userError } from "../i18n-error";
import { deleteObjects, putObject } from "./r2";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_MB = 4.5;

/**
 * The sizes the product actually renders these at, rounded up for high-DPR
 * screens. Avatars sit at 16–20px and organization logos at 24–32px through
 * most of the app; the largest anywhere is 64px, in settings and on mobile.
 * 256 covers that at 4x, so nothing bigger earns its storage.
 *
 * The widest variant is what gets stored on the row, so every existing render
 * site keeps working untouched. The small one is here for the many places
 * drawing a 16px circle, to be adopted without another migration.
 */
export const IMAGE_VARIANTS = [
	{ name: "256", width: 256 },
	{ name: "64", width: 64 },
] as const;

/** Every upload gets a fresh random key, so a URL's bytes never change. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** The variant a stored URL points at. */
export const CANONICAL_VARIANT = "256";

/**
 * Base URL of the host serving the public bucket, without a trailing slash —
 * a trailing one is valid per the env schema's `url()` and would double up in
 * every object URL built from it.
 */
function staticBaseUrl(): string {
	return env.STATIC_URL.replace(/\/+$/, "");
}

export function variantKeys(pathname: string): string[] {
	return IMAGE_VARIANTS.map((variant) => `${pathname}/${variant.name}.webp`);
}

export function imageUrlFor(pathname: string): string {
	return `${staticBaseUrl()}/${pathname}/${CANONICAL_VARIANT}.webp`;
}

/**
 * sharp is a native module, and this file is imported by the organization and
 * user routers, so loading it at module scope makes its load failure every
 * procedure's failure: on 2026-09-01 a bundle shipped without libvips and the
 * whole API answered 500 until it was rolled back. Loaded here on first use,
 * a broken sharp fails avatar and logo uploads and nothing else.
 */
async function loadSharp() {
	const { default: sharp } = await import("sharp");
	return sharp;
}

/**
 * Decodes the image and writes every variant. Shared with the backfill script
 * so a change to the sizes or the object layout cannot make fresh uploads and
 * migrated rows diverge.
 *
 * On a partial failure the objects already written are removed, so a failed
 * upload leaves nothing behind.
 */
export async function putImageVariants({
	buffer,
	pathname,
}: {
	buffer: Buffer;
	pathname: string;
}): Promise<string> {
	const sharp = await loadSharp();
	let rendered: { name: string; body: Buffer }[];
	try {
		rendered = await Promise.all(
			IMAGE_VARIANTS.map(async ({ name, width }) => ({
				name,
				body: await sharp(buffer)
					.rotate()
					.resize(width, width, { fit: "cover", withoutEnlargement: true })
					.webp({ quality: 82 })
					.toBuffer(),
			})),
		);
	} catch {
		// Reusing the type key: it is the closest catalogued message, and the
		// key set is not extracted from these calls, so a dedicated one means
		// hand-editing seventeen catalogs. The message a user sees for an
		// undecodable file is "invalid image type", which is imprecise but not
		// misleading — the file is unusable either way.
		throw userError({
			code: "BAD_REQUEST",
			message: "That file could not be read as an image",
			i18nKey: "serverError.upload.invalidImageTypeOnlyPngJpeg",
		});
	}

	// Every write is allowed to settle before cleanup runs: aborting on the
	// first rejection would let a slower PUT land after the delete and leave
	// exactly the orphan the cleanup exists to prevent.
	const writes = await Promise.allSettled(
		rendered.map(({ name, body }) =>
			putObject({
				key: `${pathname}/${name}.webp`,
				body,
				contentType: "image/webp",
				bucket: "public",
				cacheControl: CACHE_CONTROL,
			}),
		),
	);
	const failure = writes.find(
		(write): write is PromiseRejectedResult => write.status === "rejected",
	);
	if (failure) {
		await deleteObjects(variantKeys(pathname), { bucket: "public" }).catch(
			(error) =>
				console.error(
					`[upload] variants left behind at ${pathname} after a failed write`,
					error,
				),
		);
		throw failure.reason;
	}

	return imageUrlFor(pathname);
}

export async function uploadImage({
	fileData,
	mimeType,
	pathname,
	existingUrl,
}: {
	fileData: string;
	mimeType: string;
	pathname: string;
	/** The row's current URL, reclaimed once the new objects are up. */
	existingUrl: string | null;
}) {
	if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
		throw userError({
			code: "BAD_REQUEST",
			message: "Invalid image type. Only PNG, JPEG, and WebP are allowed",
			i18nKey: "serverError.upload.invalidImageTypeOnlyPngJpeg",
		});
	}

	const base64Data = fileData.includes("base64,")
		? fileData.split("base64,")[1] || fileData
		: fileData;
	const buffer = Buffer.from(base64Data, "base64");

	const sizeInMB = buffer.length / (1024 * 1024);
	if (sizeInMB > MAX_SIZE_MB) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `File too large (${sizeInMB.toFixed(2)}MB). Maximum size is ${MAX_SIZE_MB}MB`,
		});
	}

	const url = await putImageVariants({ buffer, pathname });

	void reclaim({ existingUrl, pathname }).catch((error) => {
		console.warn("Failed to remove the previous image", { existingUrl, error });
	});

	return url;
}

/**
 * Removes what the row pointed at before, now that its replacement is up.
 *
 * The old URL is not trustworthy: `organization.update` takes a logo URL
 * straight from the client, so a row can be made to point at another
 * organization's objects. Keys are namespaced by owner
 * (`organization/<id>/logo/<random>`), so reclaiming only within the prefix
 * this upload is writing to keeps a caller to its own objects, whatever the
 * column says.
 */
async function reclaim({
	existingUrl,
	pathname,
}: {
	existingUrl: string | null;
	pathname: string;
}): Promise<void> {
	if (!existingUrl) return;
	const base = `${staticBaseUrl()}/`;
	if (!existingUrl.startsWith(base)) return;

	const previous = existingUrl.slice(base.length).replace(/\/[^/]+$/, "");
	const owner = pathname.replace(/\/[^/]+$/, "");
	if (!previous || previous === pathname) return;
	if (previous.replace(/\/[^/]+$/, "") !== owner) return;

	await deleteObjects(variantKeys(previous), { bucket: "public" });
}

export function generateImagePathname({
	prefix,
}: {
	prefix: string;
	mimeType?: string;
}) {
	// No extension: the key is a folder holding every variant, and the stored
	// URL names the one the row points at.
	const randomId = Math.random().toString(36).substring(2, 15);
	return `${prefix}/${randomId}`;
}
