import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	claudeFolderTrust,
	persistClaudeFolderTrust,
	readClaudeFolderTrust,
} from "./claude-trust";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "folder-trust-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("persistClaudeFolderTrust", () => {
	test("creates the state file with the trusted entry", async () => {
		const file = join(dir, ".claude.json");
		await persistClaudeFolderTrust(file, "/tmp/session-a");
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.projects["/tmp/session-a"].hasTrustDialogAccepted).toBe(true);
	});

	test("merges into existing state, preserving other keys", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(
			file,
			JSON.stringify({
				oauthAccount: { emailAddress: "x@y.z" },
				projects: {
					"/existing": { hasTrustDialogAccepted: true, allowedTools: ["Bash"] },
					"/tmp/session-b": { allowedTools: ["Edit"] },
				},
			}),
		);
		await persistClaudeFolderTrust(file, "/tmp/session-b");
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.oauthAccount.emailAddress).toBe("x@y.z");
		expect(state.projects["/existing"].allowedTools).toEqual(["Bash"]);
		expect(state.projects["/tmp/session-b"]).toEqual({
			allowedTools: ["Edit"],
			hasTrustDialogAccepted: true,
		});
	});

	test("no-ops when the entry is already trusted", async () => {
		const file = join(dir, ".claude.json");
		const content = JSON.stringify({
			projects: { "/tmp/session-c": { hasTrustDialogAccepted: true } },
		});
		writeFileSync(file, content);
		await persistClaudeFolderTrust(file, "/tmp/session-c");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("throws on a corrupt state file without clobbering it", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "{not json");
		await expect(
			persistClaudeFolderTrust(file, "/tmp/session-d"),
		).rejects.toThrow();
		expect(readFileSync(file, "utf-8")).toBe("{not json");
	});

	test("skips when the config dir itself does not exist", async () => {
		const file = join(dir, "missing-profile", ".claude.json");
		await persistClaudeFolderTrust(file, "/tmp/session-e");
		expect(() => readFileSync(file, "utf-8")).toThrow();
	});

	test("preserves a tightened file mode across the rewrite", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "{}");
		chmodSync(file, 0o600);
		await persistClaudeFolderTrust(file, "/tmp/session-f");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});

	test("creates a brand-new store owner-only", async () => {
		const file = join(dir, ".claude.json");
		await persistClaudeFolderTrust(file, "/tmp/session-g");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});
});

describe("readClaudeFolderTrust", () => {
	test("reports trusted only for a recorded acceptance", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(
			file,
			JSON.stringify({
				projects: {
					"/yes": { hasTrustDialogAccepted: true },
					"/scaffold": { hasTrustDialogAccepted: false },
				},
			}),
		);
		expect(await readClaudeFolderTrust(file, "/yes")).toBe("trusted");
		expect(await readClaudeFolderTrust(file, "/scaffold")).toBe("none");
		expect(await readClaudeFolderTrust(file, "/absent")).toBe("none");
	});

	test("a missing or corrupt store decides nothing", async () => {
		const file = join(dir, ".claude.json");
		expect(await readClaudeFolderTrust(file, "/repo")).toBe("none");
		writeFileSync(file, '{"projects":{"/repo":{"hasTrustDialogAccepted":true}');
		expect(await readClaudeFolderTrust(file, "/repo")).toBe("none");
	});
});

describe("claudeFolderTrust.storeFile", () => {
	test("keeps state inside a custom CLAUDE_CONFIG_DIR", () => {
		expect(claudeFolderTrust.storeFile({ CLAUDE_CONFIG_DIR: "/x/work" })).toBe(
			"/x/work/.claude.json",
		);
	});
});
