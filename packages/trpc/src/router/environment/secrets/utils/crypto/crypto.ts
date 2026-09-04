import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../../../../../env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 1;

export interface SecretContext {
	environmentId: string;
	organizationId: string;
	key: string;
}

function getKey(): Buffer {
	const raw = env.SECRETS_ENCRYPTION_KEY;
	if (!raw) throw new Error("SECRETS_ENCRYPTION_KEY not set");
	const key = Buffer.from(raw, "base64");
	if (key.length !== 32)
		throw new Error("SECRETS_ENCRYPTION_KEY must be 32 bytes");
	return key;
}

/** Binds a ciphertext to its row, so a value moved to another row will not decrypt. */
function aad(context: SecretContext): Buffer {
	return Buffer.from(
		`v${VERSION}:${context.environmentId}:${context.organizationId}:${context.key}`,
		"utf8",
	);
}

export function encryptSecret(
	plaintext: string,
	context: SecretContext,
): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, getKey(), iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	cipher.setAAD(aad(context));
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

export function decryptSecret(
	encrypted: string,
	context: SecretContext,
): string {
	const buf = Buffer.from(encrypted, "base64");
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
	decipher.setAAD(aad(context));
	decipher.setAuthTag(tag);
	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf8");
}
