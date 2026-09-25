import { env as authEnv } from "@superset/auth/env";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import {
	open,
	SECRET_BOX_VERSION,
	seal,
	secretsKeyConfigured,
} from "../../lib/secret-box";

const SEALED_PREFIX = `v${SECRET_BOX_VERSION}:`;
const AAD = `v${SECRET_BOX_VERSION}:connector-secret`;

function encryptWithAuthSecret(value: string): Promise<string> {
	return symmetricEncrypt({ key: authEnv.BETTER_AUTH_SECRET, data: value });
}

function decryptWithAuthSecret(value: string): Promise<string> {
	return symmetricDecrypt({ key: authEnv.BETTER_AUTH_SECRET, data: value });
}

export async function encryptSecret(value: string): Promise<string> {
	if (!secretsKeyConfigured()) return await encryptWithAuthSecret(value);
	return SEALED_PREFIX + seal(value, AAD);
}

export async function decryptSecret(value: string): Promise<string> {
	if (!value.startsWith(SEALED_PREFIX))
		return await decryptWithAuthSecret(value);
	return open(value.slice(SEALED_PREFIX.length), AAD);
}

export async function encryptOptional(
	value: string | null | undefined,
): Promise<string | null> {
	return value ? await encryptSecret(value) : null;
}

export async function decryptOptional(
	value: string | null | undefined,
): Promise<string | null> {
	return value ? await decryptSecret(value) : null;
}
