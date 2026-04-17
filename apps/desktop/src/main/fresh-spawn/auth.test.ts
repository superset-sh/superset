import { afterEach, describe, expect, it } from "bun:test";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateTokenFile, readTokenFile, verifyToken } from "./auth";

const createdPaths: string[] = [];

function tempTokenPath(): string {
	const suffix = crypto.randomBytes(8).toString("hex");
	const p = path.join(os.tmpdir(), `fresh-spawn-auth-${suffix}.token`);
	createdPaths.push(p);
	return p;
}

afterEach(() => {
	while (createdPaths.length > 0) {
		const p = createdPaths.pop();
		if (p !== undefined) {
			fs.rmSync(p, { force: true });
		}
	}
});

describe("fresh-spawn auth", () => {
	describe("generateTokenFile", () => {
		it("creates a file at the given path with 0600 mode", () => {
			const tokenPath = tempTokenPath();
			generateTokenFile(tokenPath);

			expect(fs.existsSync(tokenPath)).toBe(true);
			const stats = fs.statSync(tokenPath);
			// Mask the file-type bits, keep only permission bits.
			const mode = stats.mode & 0o777;
			expect(mode).toBe(0o600);
		});

		it("generates a token with at least 43 chars (base64url of 32 bytes)", () => {
			const tokenPath = tempTokenPath();
			const token = generateTokenFile(tokenPath);

			expect(token.length).toBeGreaterThanOrEqual(43);
		});
	});

	describe("readTokenFile", () => {
		it("returns the same value as generateTokenFile", () => {
			const tokenPath = tempTokenPath();
			const written = generateTokenFile(tokenPath);

			const read = readTokenFile(tokenPath);
			expect(read).toBe(written);
		});
	});

	describe("verifyToken", () => {
		it("returns true for equal strings", () => {
			const token = "abc123xyz";
			expect(verifyToken(token, token)).toBe(true);
		});

		it("returns false for different strings of the same length", () => {
			expect(verifyToken("abc123xyz", "xyz321cba")).toBe(false);
		});

		it("returns false for length mismatch without throwing", () => {
			expect(() => verifyToken("short", "much-longer-token")).not.toThrow();
			expect(verifyToken("short", "much-longer-token")).toBe(false);
		});
	});
});
