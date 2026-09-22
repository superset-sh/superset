import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readClaudeLoginFingerprint } from "./claude";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});
describe("Claude login fingerprint", () => {
	it("ignores copied identity, missing credentials, and expired tokens", async () => {
		const dir = await mkdtemp(join(tmpdir(), "superset-login-test-"));
		dirs.push(dir);
		await writeFile(
			join(dir, ".claude.json"),
			JSON.stringify({
				oauthAccount: { emailAddress: "existing@example.com" },
			}),
		);
		expect(await readClaudeLoginFingerprint(dir)).toBeNull();
		await writeFile(
			join(dir, ".credentials.json"),
			JSON.stringify({
				claudeAiOauth: { accessToken: "expired-test-token", expiresAt: 1 },
			}),
		);
		expect(await readClaudeLoginFingerprint(dir)).toBeNull();
	});
	it("hashes fresh credentials and changes on re-login", async () => {
		const dir = await mkdtemp(join(tmpdir(), "superset-login-test-"));
		dirs.push(dir);
		const write = async (token: string) =>
			writeFile(
				join(dir, ".credentials.json"),
				JSON.stringify({
					claudeAiOauth: { accessToken: token, expiresAt: Date.now() + 60000 },
				}),
			);
		await write("first-test-token");
		const before = await readClaudeLoginFingerprint(dir);
		expect(before).toMatch(/^[a-f0-9]{64}$/);
		await write("second-test-token");
		expect(await readClaudeLoginFingerprint(dir)).not.toBe(before);
	});
});
