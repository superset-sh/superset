import { timingSafeEqual } from "node:crypto";
import type { HostAuthProvider } from "../types";

export class PskHostAuthProvider implements HostAuthProvider {
	private readonly secretBuffer: Buffer;

	constructor(secret: string) {
		this.secretBuffer = Buffer.from(secret);
	}

	validate(request: Request): boolean {
		const header = request.headers.get("authorization");
		const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
		return !!token && this.safeEqual(token);
	}

	validateToken(token: string): boolean {
		return this.safeEqual(token);
	}

	private safeEqual(input: string): boolean {
		const inputBuffer = Buffer.from(input);
		if (this.secretBuffer.length !== inputBuffer.length) return false;
		return timingSafeEqual(this.secretBuffer, inputBuffer);
	}
}
