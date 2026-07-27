import { z } from "zod";

/**
 * Decoded-byte ceilings for the base64 payloads clients send to the upload
 * procedures. These mirror the checks the upload helpers already run after
 * decoding — the schemas below turn them into input validation so an
 * arbitrarily large body is rejected before any blob or database work happens.
 */
export const MAX_IMAGE_UPLOAD_BYTES = 4.5 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_BYTES = 3.5 * 1024 * 1024;

/**
 * Clients may send either a bare base64 string or a `data:<mime>;base64,` URL.
 * Media types are short, but leave room so a legitimate data URL never trips
 * the length cap.
 */
const DATA_URL_PREFIX_ALLOWANCE = 256;

/**
 * Longest base64 string that can still decode to `maxBytes` or fewer bytes.
 * Base64 inflates by 4/3, rounded up to a whole 4-character quantum.
 */
export function maxBase64Length(maxBytes: number): number {
	return Math.ceil(maxBytes / 3) * 4 + DATA_URL_PREFIX_ALLOWANCE;
}

function base64FileDataSchema(maxBytes: number) {
	const megabytes = Math.round((maxBytes / 1024 / 1024) * 100) / 100;
	return z
		.string()
		.min(1)
		.max(
			maxBase64Length(maxBytes),
			`File too large. Maximum size is ${megabytes}MB`,
		);
}

/** `fileData` for the avatar / logo / project-icon upload procedures. */
export const imageUploadFileDataSchema = base64FileDataSchema(
	MAX_IMAGE_UPLOAD_BYTES,
);

/** `fileData` for `chat.uploadAttachment`. */
export const chatAttachmentFileDataSchema = base64FileDataSchema(
	MAX_CHAT_ATTACHMENT_BYTES,
);
