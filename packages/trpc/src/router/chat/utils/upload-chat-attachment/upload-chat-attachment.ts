import { db } from "@superset/db/client";
import { chatAttachments } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { del, put } from "@vercel/blob";

const ALLOWED_MEDIA_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"application/pdf",
	"text/plain",
	"text/markdown",
	"text/csv",
	"text/html",
	"application/json",
	"application/xml",
]);

// Capped at 3.5 MB raw so the base64-encoded payload stays under Anthropic's
// 5 MB inline-image limit (base64 inflates by ~4/3).
const MAX_FILE_SIZE_BYTES = 3.5 * 1024 * 1024;

function getFileBuffer(fileData: string): Buffer {
	const base64Data = fileData.includes("base64,")
		? fileData.split("base64,")[1] || fileData
		: fileData;

	return Buffer.from(base64Data, "base64");
}

function sanitizeExtension(candidate: string | undefined): string | null {
	if (!candidate) return null;
	const cleaned = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
	if (!cleaned) return null;
	return cleaned.slice(0, 16);
}

function getFileExtension({
	filename,
	mediaType,
}: {
	filename: string;
	mediaType: string;
}): string {
	const dotIndex = filename.lastIndexOf(".");
	const fromFilename =
		dotIndex >= 0 ? sanitizeExtension(filename.slice(dotIndex + 1)) : null;
	if (fromFilename) return fromFilename;

	const fromMediaType = sanitizeExtension(mediaType.split("/").pop());
	return fromMediaType ?? "bin";
}

export async function uploadChatAttachment({
	sessionId,
	userId,
	organizationId,
	filename,
	mediaType,
	fileData,
}: {
	sessionId: string;
	userId: string;
	organizationId: string;
	filename: string;
	mediaType: string;
	fileData: string;
}) {
	if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Unsupported file type: ${mediaType}`,
		});
	}

	const buffer = getFileBuffer(fileData);
	if (buffer.length > MAX_FILE_SIZE_BYTES) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
		});
	}

	const ext = getFileExtension({ filename, mediaType });
	const pathnamePrefix = `chat-attachments/${sessionId}/${crypto.randomUUID()}.${ext}`;

	const blob = await put(pathnamePrefix, buffer, {
		access: "public",
		contentType: mediaType,
		addRandomSuffix: true,
	});

	let row: { id: string } | undefined;
	try {
		[row] = await db
			.insert(chatAttachments)
			.values({
				chatSessionId: sessionId,
				createdBy: userId,
				organizationId,
				blobPathname: blob.pathname,
				mediaType,
				filename,
				sizeBytes: buffer.length,
			})
			.returning({ id: chatAttachments.id });
	} catch (error) {
		await del(blob.url).catch((cleanupError) => {
			console.error("[chat-attachments] failed to clean up orphaned blob", {
				pathname: blob.pathname,
				cleanupError,
			});
		});
		throw error;
	}

	if (!row) {
		await del(blob.url).catch((cleanupError) => {
			console.error("[chat-attachments] failed to clean up orphaned blob", {
				pathname: blob.pathname,
				cleanupError,
			});
		});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to record chat attachment",
		});
	}

	return {
		id: row.id,
		mediaType,
		filename,
	};
}
