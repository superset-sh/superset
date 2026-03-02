import { TRPCError } from "@trpc/server";
import { del, put } from "@vercel/blob";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_MB = 4.5;

export async function uploadImage({
	fileData,
	mimeType,
	pathname,
	existingUrl,
}: {
	fileData: string;
	mimeType: string;
	pathname: string;
	existingUrl: string | null;
}) {
	if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid image type. Only PNG, JPEG, and WebP are allowed",
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

	if (existingUrl) {
		try {
			await del(existingUrl);
		} catch {}
	}

	const blob = await put(pathname, buffer, {
		access: "public",
		contentType: mimeType,
	});

	return blob.url;
}

export function generateImagePathname({
	prefix,
	mimeType,
}: {
	prefix: string;
	mimeType: string;
}) {
	const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
	const randomId = Math.random().toString(36).substring(2, 15);
	return `${prefix}/${randomId}.${ext}`;
}
