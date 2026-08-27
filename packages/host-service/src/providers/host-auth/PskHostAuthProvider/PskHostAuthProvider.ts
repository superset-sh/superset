import { timingSafeEqual } from "node:crypto";
import { isValidSandboxCliToken } from "../../../runtime/sandbox/sandbox-cli-tokens";
import type { HostAuthProvider } from "../types";

export class PskHostAuthProvider implements HostAuthProvider {
	private readonly secretBuffer: Buffer;

	constructor(secret: string) {
		this.secretBuffer = Buffer.from(secret);
	}

	validate(request: Request): boolean {
		const header = request.headers.get("authorization");
		const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
		return token !== null && this.validateToken(token);
	}

	/**
	 * The org PSK, or a per-workspace sandbox CLI token (mounted into
	 * sandbox containers so the bundled CLI can reach this host without
	 * the PSK ever entering an agent's environment).
	 */
	validateToken(token: string): boolean {
		return this.safeEqual(token) || isValidSandboxCliToken(token);
	}

	private safeEqual(input: string): boolean {
		const inputBuffer = Buffer.from(input);
		if (this.secretBuffer.length !== inputBuffer.length) return false;
		return timingSafeEqual(this.secretBuffer, inputBuffer);
	}
}
