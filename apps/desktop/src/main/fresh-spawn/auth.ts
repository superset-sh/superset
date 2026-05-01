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
	// writeFileSync's `mode` option only applies when the file is created;
	// if the token path already exists with looser permissions, the mode
	// silently stays at the old value. chmod enforces 0600 regardless.
	fs.chmodSync(tokenPath, 0o600);
	return token;
}

/**
 * Read the token from disk. Throws if file missing — caller must handle.
 */
export function readTokenFile(tokenPath: string): string {
	return fs.readFileSync(tokenPath, "utf8").trim();
}

/**
 * Constant-time token comparison. Returns false on byte-length mismatch
 * without timing leak.
 *
 * Note: compares by *byte* length, not string length. JavaScript's
 * `.length` counts UTF-16 code units, but `crypto.timingSafeEqual`
 * operates on byte buffers; two strings with equal `.length` can yield
 * buffers of different byte lengths (multi-byte UTF-8 characters) and
 * would throw ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH — crashing the daemon
 * on any adversarial input.
 */
export function verifyToken(received: string, expected: string): boolean {
	const receivedBuf = Buffer.from(received, "utf8");
	const expectedBuf = Buffer.from(expected, "utf8");
	if (receivedBuf.length !== expectedBuf.length) return false;
	return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}
