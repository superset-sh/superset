import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import { userError } from "../i18n-error";
import { deleteObjects, publicBucket, putObject, staticBaseUrl } from "./r2";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_MB = 4.5;

/**
 * The sizes the product actually renders these at, rounded up for high-DPR
 * screens. Avatars sit at 16–20px and organization logos at 24–32px through
 * most of the app; the largest is 64px, in settings and on mobile. 256 covers
 * that at 4x, so nothing bigger earns its storage.
 *
 * The widest variant is what gets stored on the row, so every existing render
 * site keeps working untouched. The small one is here for the many places
 * drawing a 16px circle, to be adopted without another migration.
 */
const VARIANTS = [
	{ name: "256", width: 256 },
	{ name: "64", width: 64 },
] as const;

/** Immutable: every upload gets a fresh random key, so a URL never changes. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function uploadImage({
	fileData,
	mimeType,
	pathname,
	existingUrl,
}: {
	fileData: string;
	mimeType: string;
	pathname: string;
	/** The row's current URL, whose objects are reclaimed once this succeeds. */
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

	// `sharp` decodes the real image, so a file that passed the declared-type
	// check but is not an image fails here rather than being stored.
	let variants: { name: string; body: Buffer }[];
	try {
		variants = await Promise.all(
			VARIANTS.map(async ({ name, width }) => ({
				name,
				body: await sharp(buffer)
					.rotate()
					.resize(width, width, { fit: "cover", withoutEnlargement: true })
					.webp({ quality: 82 })
					.toBuffer(),
			})),
		);
	} catch {
		throw userError({
			code: "BAD_REQUEST",
			message: "That file could not be read as an image",
			i18nKey: "serverError.upload.invalidImageTypeOnlyPngJpeg",
		});
	}

	await Promise.all(
		variants.map(({ name, body }) =>
			putObject({
				key: `${pathname}/${name}.webp`,
				body,
				contentType: "image/webp",
				bucket: publicBucket(),
				cacheControl: CACHE_CONTROL,
			}),
		),
	);

	// The original is kept so a future variant can be generated without asking
	// the user to upload again. Nothing links to it.
	await putObject({
		key: `${pathname}/original`,
		body: buffer,
		contentType: mimeType,
		bucket: publicBucket(),
		cacheControl: CACHE_CONTROL,
	});

	// Reclaim what the row pointed at before, now that the new objects are up.
	// Only ours: a Vercel Blob URL from before the migration is left alone and
	// removed later, in one pass, once nothing references it.
	void reclaim(existingUrl).catch((error) => {
		console.warn("Failed to remove the previous image", { existingUrl, error });
	});

	return `${staticBaseUrl()}/${pathname}/256.webp`;
}

async function reclaim(existingUrl: string | null): Promise<void> {
	if (!existingUrl) return;
	const base = staticBaseUrl();
	if (!existingUrl.startsWith(`${base}/`)) return;
	// `<prefix>/<id>/256.webp` -> `<prefix>/<id>`
	const pathname = existingUrl.slice(base.length + 1).replace(/\/[^/]+$/, "");
	if (!pathname) return;
	await deleteObjects(
		[
			...VARIANTS.map((variant) => `${pathname}/${variant.name}.webp`),
			`${pathname}/original`,
		],
		{ bucket: publicBucket() },
	);
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
