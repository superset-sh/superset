import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
	const raw = process.env.SECRETS_ENCRYPTION_KEY;
	if (!raw) throw new Error("SECRETS_ENCRYPTION_KEY not set");
	const key = Buffer.from(raw, "base64");
	if (key.length !== 32)
		throw new Error("SECRETS_ENCRYPTION_KEY must be 32 bytes");
	return key;
}

export function encryptSecret(plaintext: string): string {
	const key = getKey();
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(encrypted: string): string {
	const key = getKey();
	const buf = Buffer.from(encrypted, "base64");
	const iv = buf.subarray(0, IV_LENGTH);
	const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
	const decipher = createDecipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	decipher.setAuthTag(tag);
	return decipher.update(ciphertext) + decipher.final("utf8");
}
