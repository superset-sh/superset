import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 1;

function getKey(): Buffer {
	const raw = env.SECRETS_ENCRYPTION_KEY;
	if (!raw) throw new Error("SECRETS_ENCRYPTION_KEY not set");
	const key = Buffer.from(raw, "base64");
	if (key.length !== 32)
		throw new Error("SECRETS_ENCRYPTION_KEY must be 32 bytes");
	return key;
}

/**
 * Authenticated encryption for a value at rest. `aad` binds the ciphertext to
 * the row that holds it, so a value copied into another row will not decrypt;
 * callers compose it from the columns that identify the row.
 */
export function seal(plaintext: string, aad: string): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, getKey(), iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	cipher.setAAD(Buffer.from(aad, "utf8"));
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	return Buffer.concat([
		Buffer.from([VERSION]),
		iv,
		cipher.getAuthTag(),
		encrypted,
	]).toString("base64");
}

export function open(sealed: string, aad: string): string {
	const buf = Buffer.from(sealed, "base64");
	const version = buf[0];
	if (version !== VERSION) {
		throw new Error(`Unsupported secret format: version ${version}`);
	}
	const iv = buf.subarray(1, 1 + IV_LENGTH);
	const tag = buf.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = buf.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);
	const decipher = createDecipheriv(ALGORITHM, getKey(), iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	decipher.setAAD(Buffer.from(aad, "utf8"));
	decipher.setAuthTag(tag);
	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf8");
}

export const SECRET_BOX_VERSION = VERSION;
