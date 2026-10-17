import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProfileFile } from "./profile-file";
import { API_BILLING_MARKER, readCodexProfileKind } from "./profiles";
import { readAccountIdentity } from "./session-account/session-account";

const directories: string[] = [];
async function fixture() {
	const dir = await mkdtemp(join(tmpdir(), "superset-profile-file-"));
	directories.push(dir);
	return dir;
}
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

test("reads regular profile metadata within the byte limit", async () => {
	const dir = await fixture();
	const path = join(dir, "state");
	await writeFile(path, "four");
	expect(await readProfileFile(path, 4)).toMatchObject({ content: "four" });
	expect(await readProfileFile(path, 3)).toBeNull();
	expect(await readProfileFile(dir, 64)).toBeNull();
	expect(await readProfileFile(join(dir, "missing"), 64)).toBeNull();
});

test.skipIf(process.platform === "win32")(
	"profile discovery and identity reads reject FIFOs without a writer",
	async () => {
		const dir = await fixture();
		for (const name of ["auth.json", ".claude.json", API_BILLING_MARKER]) {
			execFileSync("mkfifo", [join(dir, name)]);
		}
		expect(await readCodexProfileKind(dir)).toBeNull();
		expect(await readAccountIdentity("codex", dir)).toBeNull();
		expect(await readAccountIdentity("claude", dir)).toBeNull();
	},
);
