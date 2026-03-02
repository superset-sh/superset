import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scryptSync,
} from "node:crypto";
import { getMachineId } from "main/lib/device-info";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(salt: Buffer): Buffer {
	return scryptSync(getMachineId(), salt, KEY_LENGTH);
}

/**
 * Encrypts a string using AES-256-GCM with a machine-derived key.
 * Returns: salt (16) + iv (12) + authTag (16) + ciphertext
 */
export function encrypt(plaintext: string): Buffer {
	const salt = randomBytes(SALT_LENGTH);
	const key = deriveKey(salt);
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	// Combine all components: salt + iv + authTag + ciphertext
	return Buffer.concat([salt, iv, authTag, encrypted]);
}

const MIN_ENCRYPTED_LENGTH = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;

/**
 * Decrypts data encrypted with the encrypt function.
 */
export function decrypt(data: Buffer): string {
	if (data.length < MIN_ENCRYPTED_LENGTH) {
		throw new Error("Encrypted data too short");
	}

	// Extract components
	const salt = data.subarray(0, SALT_LENGTH);
	const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
	const authTag = data.subarray(
		SALT_LENGTH + IV_LENGTH,
		SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
	);
	const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

	const key = deriveKey(salt);
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf8");
}
