import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	codexLaunchOverride,
	persistCodexFolderTrust,
	readCodexFolderTrust,
} from "./codex-trust";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "folder-trust-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("persistCodexFolderTrust", () => {
	test("creates config.toml with the trusted table", async () => {
		const file = join(dir, "config.toml");
		await persistCodexFolderTrust(file, "/tmp/session-a");
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
		await persistCodexFolderTrust(file, "/tmp/session-b");
		expect(readFileSync(file, "utf-8")).toBe(
			'model = "gpt-5"\n\n[projects."/other"]\ntrust_level = "trusted"\n\n[projects."/tmp/session-b"]\ntrust_level = "trusted"\n',
		);
	});

	test("leaves an existing table for the path untouched", async () => {
		const file = join(dir, "config.toml");
		const content = '[projects."/tmp/session-c"]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await persistCodexFolderTrust(file, "/tmp/session-c");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("escapes quotes and backslashes in the path key", async () => {
		const file = join(dir, "config.toml");
		await persistCodexFolderTrust(file, '/tmp/we"ird\\path');
		expect(readFileSync(file, "utf-8")).toBe(
			'[projects."/tmp/we\\"ird\\\\path"]\ntrust_level = "trusted"\n',
		);
	});

	test("skips when the codex home does not exist", async () => {
		const file = join(dir, "missing-home", "config.toml");
		await persistCodexFolderTrust(file, "/tmp/session-d");
		expect(() => readFileSync(file, "utf-8")).toThrow();
	});

	test("detects an equivalent header with different spacing", async () => {
		const file = join(dir, "config.toml");
		const content =
			'[ projects . "/tmp/session-e" ]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await persistCodexFolderTrust(file, "/tmp/session-e");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("detects a literal-string header", async () => {
		const file = join(dir, "config.toml");
		const content =
			"[projects.'/tmp/session-f']\ntrust_level = \"untrusted\"\n";
		writeFileSync(file, content);
		await persistCodexFolderTrust(file, "/tmp/session-f");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("detects a top-level dotted key", async () => {
		const file = join(dir, "config.toml");
		const content = 'projects."/tmp/session-g".trust_level = "untrusted"\n';
		writeFileSync(file, content);
		await persistCodexFolderTrust(file, "/tmp/session-g");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("matches an escaped header against the raw path", async () => {
		const file = join(dir, "config.toml");
		const content =
			'[projects."/tmp/we\\"ird\\\\path"]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await persistCodexFolderTrust(file, '/tmp/we"ird\\path');
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("still appends when only a different path is defined", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(file, '[ projects . "/other" ]\ntrust_level = "trusted"\n');
		await persistCodexFolderTrust(file, "/tmp/session-h");
		expect(readFileSync(file, "utf-8")).toContain(
			'[projects."/tmp/session-h"]\ntrust_level = "trusted"\n',
		);
	});
});

describe("readCodexFolderTrust", () => {
	test("reads trust_level only from the matching table", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(
			file,
			'[projects."/other"]\ntrust_level = "trusted"\n\n[projects."/repo"]\ntrust_level = "untrusted"\n\n[tui]\ntrust_level = "trusted"\n',
		);
		expect(await readCodexFolderTrust(file, "/other")).toBe("trusted");
		expect(await readCodexFolderTrust(file, "/repo")).toBe("declined");
		expect(await readCodexFolderTrust(file, "/absent")).toBe("none");
	});

	test("an entry in a spelling it does not parse is the user's, not ours", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(file, 'projects."/repo".trust_level = "trusted"\n');
		expect(await readCodexFolderTrust(file, "/repo")).toBe("declined");
	});

	test("a missing store decides nothing", async () => {
		expect(await readCodexFolderTrust(join(dir, "nope.toml"), "/repo")).toBe(
			"none",
		);
	});
});

describe("codexLaunchOverride", () => {
	test("trusts every folder in a single -c, since each -c replaces the table", () => {
		expect(codexLaunchOverride(["/a", '/b "q"'])).toEqual([
			"-c",
			'projects={"/a"={trust_level="trusted"},"/b \\"q\\""={trust_level="trusted"}}',
		]);
	});

	test("adds nothing when there is no trust to carry", () => {
		expect(codexLaunchOverride([])).toEqual([]);
	});
});
