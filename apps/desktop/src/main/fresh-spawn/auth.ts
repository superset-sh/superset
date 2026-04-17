import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Generate a cryptographically random token, write to path with 0600 mode,
 * and return the token string.
 */
export function generateTokenFile(tokenPath: string): string {
	const token = crypto.randomBytes(32).toString("base64url");
	fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
	fs.writeFileSync(tokenPath, token, { mode: 0o600 });
	return token;
}

/**
 * Read the token from disk. Throws if file missing — caller must handle.
 */
export function readTokenFile(tokenPath: string): string {
	return fs.readFileSync(tokenPath, "utf8").trim();
}

/**
 * Constant-time token comparison. Returns false on length mismatch
 * without timing leak.
 */
export function verifyToken(received: string, expected: string): boolean {
	if (received.length !== expected.length) return false;
	return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
