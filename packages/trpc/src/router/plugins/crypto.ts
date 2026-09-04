import { env } from "@superset/auth/env";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

function key(): string {
	return env.BETTER_AUTH_SECRET;
}

export async function encryptSecret(value: string): Promise<string> {
	return await symmetricEncrypt({ key: key(), data: value });
}

export async function decryptSecret(value: string): Promise<string> {
	return await symmetricDecrypt({ key: key(), data: value });
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
