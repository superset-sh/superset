import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";

// Everything an upload can be rejected for before it reaches Postgres or Blob.
// Shared by page publishing and file uploads, which differ only in their
// allowlist and size cap.

/** Accepts a bare base64 payload or a full `data:...;base64,...` URL. */
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

	const buffer = decodeBase64Content(content);
	if (buffer.length === 0) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "File is empty" });
	}
	if (buffer.length > maxBytes) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `File too large (${(buffer.length / 1024 / 1024).toFixed(2)}MB). Maximum is ${maxBytes / 1024 / 1024}MB`,
		});
	}

	return { buffer, sha256: createHash("sha256").update(buffer).digest("hex") };
}
