import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAccountIdentity, validateSessionAccount } from "./session-account";

const dirs: string[] = [];
async function directory() {
	const path = await mkdtemp(join(tmpdir(), "session-account-"));
	dirs.push(path);
	return path;
}
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});
const token = (sub: string, email: string) =>
	`header.${Buffer.from(JSON.stringify({ sub, email })).toString("base64url")}.signature`;

describe("session account identity", () => {
	test("Codex token rotation preserves identity; another member of the same account invalidates it", async () => {
		const dir = await directory();
		const auth = (sub: string, access: string) =>
			JSON.stringify({
				tokens: {
					account_id: "team",
					id_token: token(sub, `${sub}@example.com`),
					access_token: access,
				},
			});
		await writeFile(join(dir, "auth.json"), auth("alice", "first"));
		const before = await readAccountIdentity("codex", dir);
		expect(before).not.toBeNull();
		if (!before) throw new Error("Expected a login identity");
		await writeFile(join(dir, "auth.json"), auth("alice", "rotated"));
		expect(await readAccountIdentity("codex", dir)).toEqual(before);
		await writeFile(join(dir, "auth.json"), auth("bob", "other"));
		expect(
			await validateSessionAccount({
				agent: "codex",
				selection: dir,
				directory: dir,
				credentialKind: "subscription",
				...before,
			}),
		).toBe(false);
	});
	test("Claude state edits preserve identity but a sign-in change does not", async () => {
		const dir = await directory();
		const file = join(dir, ".claude.json");
		await writeFile(
			file,
			JSON.stringify({
				oauthAccount: {
					accountUuid: "alice",
					emailAddress: "alice@example.com",
				},
			}),
		);
		const before = await readAccountIdentity("claude", dir);
		await writeFile(
			file,
			JSON.stringify({
				numStartups: 4,
				oauthAccount: {
					accountUuid: "alice",
					emailAddress: "alice@example.com",
				},
			}),
		);
		expect(await readAccountIdentity("claude", dir)).toEqual(before);
		await writeFile(
			file,
			JSON.stringify({
				oauthAccount: { accountUuid: "bob", emailAddress: "bob@example.com" },
			}),
		);
		expect(await readAccountIdentity("claude", dir)).not.toEqual(before);
	});
	test("missing, signed-out and malformed identities cannot supply a quota", async () => {
		const dir = await directory();
		expect(await readAccountIdentity("codex", dir)).toBeNull();
		await writeFile(
			join(dir, "auth.json"),
			JSON.stringify({ OPENAI_API_KEY: "test-key" }),
		);
		expect(await readAccountIdentity("codex", dir)).toBeNull();
		await writeFile(join(dir, "auth.json"), "{");
		expect(await readAccountIdentity("codex", dir)).toBeNull();
	});
});
