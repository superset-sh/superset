import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { userError } from "../i18n-error";

const DATA_URL_PREFIX_SLACK = 256;

function maxEncodedLength(maxBytes: number): number {
	return Math.ceil(maxBytes / 3) * 4 + DATA_URL_PREFIX_SLACK;
}

export function decodeBase64Content(content: string): Buffer {
	const base64 = content.includes("base64,")
		? (content.split("base64,")[1] ?? content)
		: content;
	return Buffer.from(base64, "base64");
}

export function validateUploadBytes({
	content,
	contentType,
	allowed,
	maxBytes,
}: {
	content: string;
	contentType: string;
	allowed: ReadonlySet<string>;
	maxBytes: number;
}): { buffer: Buffer; sha256: string } {
	if (!allowed.has(contentType)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Unsupported content type: ${contentType}`,
		});
	}

	if (content.length > maxEncodedLength(maxBytes)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `File too large. Maximum is ${maxBytes / 1024 / 1024}MB`,
		});
	}

	const buffer = decodeBase64Content(content);
	if (buffer.length === 0) {
		throw userError({
			code: "BAD_REQUEST",
			message: "File is empty",
			i18nKey: "serverError.uploadBytes.fileIsEmpty",
		});
	}
	if (buffer.length > maxBytes) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `File too large (${(buffer.length / 1024 / 1024).toFixed(2)}MB). Maximum is ${maxBytes / 1024 / 1024}MB`,
		});
	}

	return { buffer, sha256: createHash("sha256").update(buffer).digest("hex") };
}
