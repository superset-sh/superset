import { execFileSync } from "node:child_process";
import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scryptSync,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Gets a stable machine identifier for key derivation.
 * This provides "good enough" protection for local credential storage
 * without requiring OS keychain access.
 */
function getMachineId(): string {
	try {
		const os = platform();

		if (os === "darwin") {
			// macOS: Use IOPlatformUUID (hardware UUID)
			const output = execFileSync(
				"ioreg",
				["-rd1", "-c", "IOPlatformExpertDevice"],
				{ encoding: "utf8" },
			);
			const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
			if (match?.[1]) return match[1];
		} else if (os === "linux") {
			// Linux: Use machine-id
			try {
				return readFileSync("/etc/machine-id", "utf8").trim();
			} catch {
				return readFileSync("/var/lib/dbus/machine-id", "utf8").trim();
			}
		} else if (os === "win32") {
			// Windows: Use MachineGuid from registry
			const output = execFileSync(
				"reg",
				[
					"query",
					"HKLM\\SOFTWARE\\Microsoft\\Cryptography",
					"/v",
					"MachineGuid",
				],
				{ encoding: "utf8" },
			);
			const match = output.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
			if (match?.[1]) return match[1];
		}
	} catch {
		// Fallback if platform-specific method fails
	}

	// Fallback: Use a combination of stable system properties
	// This is less secure but ensures the app still works
	return `${hostname()}-${homedir()}-superset-fallback`;
}

/**
 * Derives an encryption key from the machine ID and a salt.
 */
function deriveKey(salt: Buffer): Buffer {
	const machineId = getMachineId();
	return scryptSync(machineId, salt, KEY_LENGTH);
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
