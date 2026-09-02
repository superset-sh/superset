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
	resolveTrustFamily,
	seedClaudeFolderTrust,
	seedCodexFolderTrust,
} from "./seed-agent-trust";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "seed-agent-trust-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("resolveTrustFamily", () => {
	test("matches by preset id", () => {
		expect(resolveTrustFamily({ presetId: "claude", command: "claude" })).toBe(
			"claude",
		);
		expect(resolveTrustFamily({ presetId: "codex", command: "codex" })).toBe(
			"codex",
		);
	});

	test("matches custom presets by launch executable", () => {
		expect(
			resolveTrustFamily({
				presetId: "custom-abc",
				command: "/usr/local/bin/claude --verbose",
			}),
		).toBe("claude");
		expect(
			resolveTrustFamily({
				presetId: "custom-def",
				command: "C:\\tools\\codex.exe",
			}),
		).toBe("codex");
	});

	test("returns null for providers without a known trust store", () => {
		expect(resolveTrustFamily({ presetId: "gemini", command: "gemini" })).toBe(
			null,
		);
		expect(
			resolveTrustFamily({ presetId: "custom-xyz", command: "my-agent" }),
		).toBe(null);
	});
});

describe("seedClaudeFolderTrust", () => {
	test("creates the state file with the trusted entry", async () => {
		const file = join(dir, ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-a");
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
		await seedClaudeFolderTrust(file, "/tmp/session-b");
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
		await seedClaudeFolderTrust(file, "/tmp/session-c");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("throws on a corrupt state file without clobbering it", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "{not json");
		await expect(
			seedClaudeFolderTrust(file, "/tmp/session-d"),
		).rejects.toThrow();
		expect(readFileSync(file, "utf-8")).toBe("{not json");
	});

	test("skips when the config dir itself does not exist", async () => {
		const file = join(dir, "missing-profile", ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-e");
		expect(() => readFileSync(file, "utf-8")).toThrow();
	});

	test("preserves a tightened file mode across the rewrite", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "{}");
		chmodSync(file, 0o600);
		await seedClaudeFolderTrust(file, "/tmp/session-f");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});

	test("creates a brand-new store owner-only", async () => {
		const file = join(dir, ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-g");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});
});

describe("seedCodexFolderTrust", () => {
	test("creates config.toml with the trusted table", async () => {
		const file = join(dir, "config.toml");
		await seedCodexFolderTrust(file, "/tmp/session-a");
		expect(readFileSync(file, "utf-8")).toBe(
			'[projects."/tmp/session-a"]\ntrust_level = "trusted"\n',
		);
	});

	test("appends after existing content, preserving it", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(
			file,
			'model = "gpt-5"\n\n[projects."/other"]\ntrust_level = "trusted"\n',
		);
		await seedCodexFolderTrust(file, "/tmp/session-b");
		expect(readFileSync(file, "utf-8")).toBe(
			'model = "gpt-5"\n\n[projects."/other"]\ntrust_level = "trusted"\n\n[projects."/tmp/session-b"]\ntrust_level = "trusted"\n',
		);
	});

	test("leaves an existing table for the path untouched", async () => {
		const file = join(dir, "config.toml");
		const content = '[projects."/tmp/session-c"]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-c");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("escapes quotes and backslashes in the path key", async () => {
		const file = join(dir, "config.toml");
		await seedCodexFolderTrust(file, '/tmp/we"ird\\path');
		expect(readFileSync(file, "utf-8")).toBe(
			'[projects."/tmp/we\\"ird\\\\path"]\ntrust_level = "trusted"\n',
		);
	});

	test("skips when the codex home does not exist", async () => {
		const file = join(dir, "missing-home", "config.toml");
		await seedCodexFolderTrust(file, "/tmp/session-d");
		expect(() => readFileSync(file, "utf-8")).toThrow();
	});

	test("detects an equivalent header with different spacing", async () => {
		const file = join(dir, "config.toml");
		const content =
			'[ projects . "/tmp/session-e" ]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-e");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("detects a literal-string header", async () => {
		const file = join(dir, "config.toml");
		const content =
			"[projects.'/tmp/session-f']\ntrust_level = \"untrusted\"\n";
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-f");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("detects a top-level dotted key", async () => {
		const file = join(dir, "config.toml");
		const content = 'projects."/tmp/session-g".trust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-g");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("matches an escaped header against the raw path", async () => {
		const file = join(dir, "config.toml");
		const content =
			'[projects."/tmp/we\\"ird\\\\path"]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, '/tmp/we"ird\\path');
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("still appends when only a different path is defined", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(file, '[ projects . "/other" ]\ntrust_level = "trusted"\n');
		await seedCodexFolderTrust(file, "/tmp/session-h");
		expect(readFileSync(file, "utf-8")).toContain(
			'[projects."/tmp/session-h"]\ntrust_level = "trusted"\n',
		);
	});
});
