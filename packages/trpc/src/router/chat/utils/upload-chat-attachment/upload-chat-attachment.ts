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

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function getFileBuffer(fileData: string): Buffer {
	const base64Data = fileData.includes("base64,")
		? fileData.split("base64,")[1] || fileData
		: fileData;

	return Buffer.from(base64Data, "base64");
}

function getFileExtension({
	filename,
	mediaType,
}: {
	filename: string;
	mediaType: string;
}): string {
	const filenameExtension = filename.split(".").pop()?.trim().toLowerCase();
	if (filenameExtension) {
		return filenameExtension;
	}

	return mediaType.split("/").pop()?.trim().toLowerCase() || "bin";
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
