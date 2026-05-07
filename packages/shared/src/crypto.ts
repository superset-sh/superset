import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * We use AES-256-GCM for authenticated encryption. 
 * This ensures that if the data is tampered with in the database, 
 * decryption will fail instead of returning corrupted data.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard IV length
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
	const raw = process.env.SECRETS_ENCRYPTION_KEY;
	if (!raw) {
		throw new Error("SECRETS_ENCRYPTION_KEY is missing from environment variables");
	}

	const key = Buffer.from(raw, "base64");
	if (key.length !== 32) {
		throw new Error("Encryption key must be exactly 32 bytes (base64 encoded)");
	}

	return key;
}

/**
 * Encrypts a string and returns a base64 string formatted as: [IV][Tag][Ciphertext]
 */
export function encryptSecret(plaintext: string): string {
	const key = getEncryptionKey();
	const iv = randomBytes(IV_LENGTH);
	
	const cipher = createCipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});

	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);

	const tag = cipher.getAuthTag();

	// We bundle the IV and Tag with the ciphertext so we don't need extra DB columns
	return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypts a base64 string created by encryptSecret
 */
export function decryptSecret(encrypted: string): string {
	const key = getEncryptionKey();
	const buf = Buffer.from(encrypted, "base64");

	// GCM standard overhead is IV (12B) + Tag (16B) = 28B
	if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
		throw new Error("Invalid encrypted data format");
	}

	// Extract the components from the combined buffer
	const iv = buf.subarray(0, IV_LENGTH);
	const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

	const decipher = createDecipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	decipher.setAuthTag(tag);

	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf8");
}

/**
 * Attempts to decrypt a secret, but falls back to the original string if 
 * decryption fails (e.g., legacy plaintext data).
 */
export function tryDecryptSecret(value: string | null | undefined): string {
	if (!value) return "";
	try {
		return decryptSecret(value);
	} catch (err) {
		// If it's not a valid base64 or doesn't match our format, 
		// assume it's legacy plaintext for now.
		return value;
	}
}
