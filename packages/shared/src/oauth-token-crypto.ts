import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = "enc:v1:";

function getKey(): Buffer {
	const raw = process.env.OAUTH_TOKENS_ENCRYPTION_KEY;
	if (!raw) throw new Error("OAUTH_TOKENS_ENCRYPTION_KEY not set");
	const key = Buffer.from(raw, "base64");
	if (key.length !== 32) {
		throw new Error("OAUTH_TOKENS_ENCRYPTION_KEY must decode to 32 bytes");
	}
	return key;
}

export function isOAuthTokenEncrypted(value: string): boolean {
	return value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptOAuthToken(plaintext: string): string {
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
	const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");
	return `${ENCRYPTED_PREFIX}${payload}`;
}

export function decryptOAuthToken(value: string): string {
	if (!isOAuthTokenEncrypted(value)) {
		return value;
	}

	const key = getKey();
	const payload = value.slice(ENCRYPTED_PREFIX.length);
	const buf = Buffer.from(payload, "base64");
	if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
		throw new Error("Invalid encrypted OAuth token payload");
	}

	const iv = buf.subarray(0, IV_LENGTH);
	const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
	const decipher = createDecipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	decipher.setAuthTag(tag);
	return decipher.update(ciphertext) + decipher.final("utf8");
}
