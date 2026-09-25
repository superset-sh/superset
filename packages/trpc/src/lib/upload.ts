import { TRPCError } from "@trpc/server";
import { env } from "../env";
import { userError } from "../i18n-error";
import { deleteObjects, putObject } from "./r2";

const MAX_SIZE_MB = 4.5;

/**
 * The width the stored URL asks for. Avatars sit at 16–20px and organization
 * logos at 24–32px through most of the app; the largest anywhere is 64px, in
 * settings and on mobile. 256 covers that at 4x.
 *
 * Any other size is a different URL rather than a different object, so a render
 * site that wants 64 asks for 64 without a migration or a second upload.
 */
export const CANONICAL_WIDTH = 256;

/** Every upload gets a fresh random key, so a URL's bytes never change. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Base URL of the host serving the public bucket, without a trailing slash —
 * a trailing one is valid per the env schema's `url()` and would double up in
 * every object URL built from it.
 */
function staticBaseUrl(): string {
	return env.STATIC_URL.replace(/\/+$/, "");
}

/**
 * The bytes as uploaded. Cloudflare resizes on read, so there is one object per
 * image instead of one per size.
 */
function originalKey(pathname: string): string {
	return `${pathname}/original`;
}

/**
 * Fresh uploads store a single object; rows written by the old pipeline still
 * point at generated variants. Reclaiming lists both shapes because a row can
 * be either, and deleting a key that was never there costs nothing.
 */
function objectKeysFor(pathname: string): string[] {
	return [originalKey(pathname), `${pathname}/256.webp`, `${pathname}/64.webp`];
}

/**
 * A Cloudflare transformation URL, resized and re-encoded at the edge and
 * cached there. `format=auto` negotiates AVIF or WebP per request, so the
 * stored URL does not pin a format the requesting browser may not support.
 *
 * `fit=crop` rather than `cover`: both fill the square, but crop never
 * upscales, which is what sharp's `withoutEnlargement` did. A 48px avatar
 * stays 48px instead of being blown up to a soft 256.
 *
 * Requires Images > Transformations to be enabled on the supersetusercontent
 * zone; without it the edge does not intercept `/cdn-cgi/image/` and the
 * request falls through to R2, which has no such key.
 */
const TRANSFORM_OPTIONS = `width=${CANONICAL_WIDTH},height=${CANONICAL_WIDTH},fit=crop,format=auto`;

/** A transformation URL over any object key in the public bucket. */
export function transformUrlFor(key: string): string {
	return `${staticBaseUrl()}/cdn-cgi/image/${TRANSFORM_OPTIONS}/${key}`;
}

export function imageUrlFor(pathname: string): string {
	return transformUrlFor(originalKey(pathname));
}

/**
 * The real type, read from the leading bytes rather than taken from the
 * client. This is the gate that decoding used to provide: without it the only
 * check on the content is a header the uploader chose, and the public bucket
 * would happily serve an SVG or an HTML document that a browser then executes
 * on the static origin.
 */
function sniffImageType(buffer: Buffer): string | null {
	if (
		buffer.length >= 8 &&
		buffer
			.subarray(0, 8)
			.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	) {
		return "image/png";
	}
	if (
		buffer.length >= 3 &&
		buffer[0] === 0xff &&
		buffer[1] === 0xd8 &&
		buffer[2] === 0xff
	) {
		return "image/jpeg";
	}
	if (
		buffer.length >= 12 &&
		buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
		buffer.subarray(8, 12).toString("ascii") === "WEBP"
	) {
		return "image/webp";
	}
	return null;
}

/**
 * Whether the file ends the way its format says it should. Decoding used to
 * catch a truncated upload; this catches the same case — the common one, where
 * a transfer stopped early — without a decoder. It is deliberately not a
 * validity check: bytes corrupted in the middle still pass here and fail later
 * at the edge.
 */
function looksComplete(buffer: Buffer, contentType: string): boolean {
	if (contentType === "image/png") {
		const iend = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
		return buffer.length >= 8 && buffer.subarray(-8).equals(iend);
	}
	if (contentType === "image/jpeg") {
		return (
			buffer.length >= 2 &&
			buffer[buffer.length - 2] === 0xff &&
			buffer[buffer.length - 1] === 0xd9
		);
	}
	if (contentType === "image/webp") {
		// RIFF records the payload length in bytes 4..8; the file is that plus
		// the 8 bytes of header.
		return buffer.length >= 12 && buffer.readUInt32LE(4) + 8 === buffer.length;
	}
	return true;
}

export async function uploadImage({
	fileData,
	pathname,
	existingUrl,
}: {
	fileData: string;
	pathname: string;
	/** The row's current URL, reclaimed once the new object is up. */
	existingUrl: string | null;
}) {
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

	// The bytes decide, not the Content-Type the client sent: the sniff is
	// strictly the stronger check, and consulting the header as well only adds
	// a way to reject a valid image that a browser happened to mislabel.
	const contentType = sniffImageType(buffer);
	if (!contentType || !looksComplete(buffer, contentType)) {
		throw userError({
			code: "BAD_REQUEST",
			message: "Invalid image type. Only PNG, JPEG, and WebP are allowed",
			i18nKey: "serverError.upload.invalidImageTypeOnlyPngJpeg",
		});
	}

	// The sniffed type, never the declared one: it is what the bucket will
	// serve the bytes as, and the two disagreeing is the interesting case.
	await putObject({
		key: originalKey(pathname),
		body: buffer,
		contentType,
		bucket: "public",
		cacheControl: CACHE_CONTROL,
	});

	void reclaim({ existingUrl, pathname }).catch((error) => {
		console.warn("Failed to remove the previous image", { existingUrl, error });
	});

	return imageUrlFor(pathname);
}

/**
 * The pathname a stored URL points at, for either URL shape: a transformation
 * URL carries the source path after the options segment, an older direct URL
 * is the key itself. Returns null for anything not on our static host.
 */
function pathnameFromUrl(url: string): string | null {
	const base = `${staticBaseUrl()}/`;
	if (!url.startsWith(base)) return null;

	let key = url.slice(base.length);
	const prefix = "cdn-cgi/image/";
	if (key.startsWith(prefix)) {
		const rest = key.slice(prefix.length);
		const slash = rest.indexOf("/");
		if (slash === -1) return null;
		key = rest.slice(slash + 1);
	}

	const pathname = key.replace(/\/[^/]+$/, "");
	return pathname || null;
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

	const previous = pathnameFromUrl(existingUrl);
	const owner = pathname.replace(/\/[^/]+$/, "");
	if (!previous || previous === pathname) return;
	if (previous.replace(/\/[^/]+$/, "") !== owner) return;

	await deleteObjects(objectKeysFor(previous), { bucket: "public" });
}

export function generateImagePathname({ prefix }: { prefix: string }) {
	// No extension: the key is a folder holding the uploaded bytes, and the
	// stored URL describes the rendition asked of them.
	const randomId = Math.random().toString(36).substring(2, 15);
	return `${prefix}/${randomId}`;
}
