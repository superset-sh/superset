import { open, SECRET_BOX_VERSION, seal } from "../../../../../lib/secret-box";

export interface SecretContext {
	environmentId: string;
	organizationId: string;
	key: string;
}

/** Binds a ciphertext to its row, so a value moved to another row will not decrypt. */
function aad(context: SecretContext): string {
	return `v${SECRET_BOX_VERSION}:${context.environmentId}:${context.organizationId}:${context.key}`;
}

export function encryptSecret(
	plaintext: string,
	context: SecretContext,
): string {
	return seal(plaintext, aad(context));
}

export function decryptSecret(
	encrypted: string,
	context: SecretContext,
): string {
	return open(encrypted, aad(context));
}
