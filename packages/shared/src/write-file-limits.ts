import { z } from "zod";

/**
 * Upper bound on a single `filesystem.writeFile` payload, shared by the desktop
 * (Electron IPC) and host-service (network) routers. Without it the input
 * schema accepts an arbitrarily long string and the receiving process buffers
 * whatever the caller hands it. 5MB clears real usage comfortably: the editor
 * refuses to load files larger than 2MB, and drag-and-drop uploads take the
 * base64 branch below.
 */
export const MAX_WRITE_FILE_BYTES = 5_000_000;

/**
 * Base64 inflates by 4/3 (rounded up to a whole 4-char quantum), so encoding
 * the same byte budget needs a longer string cap.
 */
export const MAX_WRITE_FILE_BASE64_LENGTH =
	Math.ceil(MAX_WRITE_FILE_BYTES / 3) * 4;

const TOO_LARGE_MESSAGE = `File content is too large. Maximum size is ${
	MAX_WRITE_FILE_BYTES / 1_000_000
}MB`;

export const writeFileContentSchema = z.union([
	z.string().max(MAX_WRITE_FILE_BYTES, TOO_LARGE_MESSAGE),
	z.object({
		kind: z.literal("base64"),
		data: z.string().max(MAX_WRITE_FILE_BASE64_LENGTH, TOO_LARGE_MESSAGE),
	}),
]);
