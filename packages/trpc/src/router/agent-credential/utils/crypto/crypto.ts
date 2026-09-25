import { open, SECRET_BOX_VERSION, seal } from "../../../../lib/secret-box";

export interface AgentCredentialContext {
	userId: string;
	agent: string;
}

/** Binds the ciphertext to the person and agent it was stored for. */
function aad(context: AgentCredentialContext): string {
	return `v${SECRET_BOX_VERSION}:agent-credential:${context.userId}:${context.agent}`;
}

export function encryptAgentCredential(
	plaintext: string,
	context: AgentCredentialContext,
): string {
	return seal(plaintext, aad(context));
}

export function decryptAgentCredential(
	encrypted: string,
	context: AgentCredentialContext,
): string {
	return open(encrypted, aad(context));
}
