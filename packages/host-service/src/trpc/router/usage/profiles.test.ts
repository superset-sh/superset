import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API_BILLING_MARKER, readCodexProfileKind } from "./profiles";

const roots: string[] = [];

function tempProfile(): string {
	const root = mkdtempSync(join(tmpdir(), "superset-api-profile-"));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("readCodexProfileKind", () => {
	it("recognizes a completed API login from metadata without opening auth.json", async () => {
		const profile = tempProfile();
		writeFileSync(join(profile, API_BILLING_MARKER), "");
		// A directory cannot be read as auth.json; classification still succeeds
		// because API credentials are intentionally outside this code path.
		mkdirSync(join(profile, "auth.json"));

		expect(await readCodexProfileKind(profile)).toMatchObject({
			credentialKind: "api_key",
		});
	});

	it("recognizes subscription OAuth auth", async () => {
		const profile = tempProfile();
		writeFileSync(
			join(profile, "auth.json"),
			JSON.stringify({ tokens: { access_token: "test-token" } }),
		);

		expect(await readCodexProfileKind(profile)).toEqual({
			credentialKind: "subscription",
			loginFingerprint: null,
		});
	});

	it("rejects incomplete auth files", async () => {
		const profile = tempProfile();
		writeFileSync(join(profile, "auth.json"), '{"auth_mode":"apikey"}');
		expect(await readCodexProfileKind(profile)).toBeNull();
	});
});
