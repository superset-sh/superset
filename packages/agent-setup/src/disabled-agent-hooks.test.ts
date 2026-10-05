import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	getAgentHooksStateFilePath,
	readSharedDisabledAgentIds,
	resolveDisabledAgentIds,
	writeSharedDisabledAgentIds,
} from "./disabled-agent-hooks";

const ORIGINAL_HOME_DIR = process.env.SUPERSET_HOME_DIR;
const ORIGINAL_DISABLED = process.env.SUPERSET_DISABLED_AGENT_HOOKS;

let testHome: string;

beforeEach(() => {
	// A fresh directory per test (rather than wiping/reusing one shared dir)
	// so this file has no directory-reuse race with anything else in the suite.
	testHome = fs.mkdtempSync(path.join(os.tmpdir(), "superset-hooks-"));
	process.env.SUPERSET_HOME_DIR = testHome;
	delete process.env.SUPERSET_DISABLED_AGENT_HOOKS;
	// agent-wrappers.test.ts mock.module()s "./paths" for the whole process
	// without restoring it, and bun runs a package's test files in one process
	// in no guaranteed order. So when that file loads first,
	// resolveSupersetHomeDir() here ignores SUPERSET_HOME_DIR and lands in that
	// file's root: every test below shares one state file, and the root itself
	// may already be deleted by that file's afterEach. Work from the path these
	// tests actually read — clear the state file so an earlier test's write
	// can't leak in, and create its directory so the writes here can't fail.
	const stateFile = getAgentHooksStateFilePath();
	fs.mkdirSync(path.dirname(stateFile), { recursive: true });
	fs.rmSync(stateFile, { force: true });
});

afterEach(() => {
	if (ORIGINAL_HOME_DIR === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = ORIGINAL_HOME_DIR;
	if (ORIGINAL_DISABLED === undefined)
		delete process.env.SUPERSET_DISABLED_AGENT_HOOKS;
	else process.env.SUPERSET_DISABLED_AGENT_HOOKS = ORIGINAL_DISABLED;
	fs.rmSync(testHome, { recursive: true, force: true });
});

describe("shared disabled-agent-hooks state", () => {
	it("round-trips the disable list through the shared file", () => {
		writeSharedDisabledAgentIds(["codex", "claude"]);

		expect(readSharedDisabledAgentIds()).toEqual(["claude", "codex"]);
		expect(
			JSON.parse(fs.readFileSync(getAgentHooksStateFilePath(), "utf-8")),
		).toEqual({ disabledAgentIds: ["claude", "codex"] });
	});

	it("treats a missing or corrupt file as nothing disabled", () => {
		// Remove at the path the reader resolves, not just under TEST_HOME: a
		// sibling file's top-level hook can leave SUPERSET_HOME_DIR pointing
		// elsewhere in CI, and the previous test's write then survives afterEach.
		fs.rmSync(getAgentHooksStateFilePath(), { force: true });
		expect(readSharedDisabledAgentIds()).toEqual([]);

		fs.writeFileSync(getAgentHooksStateFilePath(), "{not json");
		expect(readSharedDisabledAgentIds()).toEqual([]);

		fs.writeFileSync(
			getAgentHooksStateFilePath(),
			JSON.stringify({ disabledAgentIds: "claude" }),
		);
		expect(readSharedDisabledAgentIds()).toEqual([]);
	});

	it("uses the shared file when no explicit list is given", () => {
		writeSharedDisabledAgentIds(["claude"]);

		expect(resolveDisabledAgentIds()).toEqual(["claude"]);
	});

	it("lets an explicit list replace the file, with env on top", () => {
		writeSharedDisabledAgentIds(["claude"]);
		process.env.SUPERSET_DISABLED_AGENT_HOOKS = "codex, gemini,,";

		expect(resolveDisabledAgentIds(["droid"]).sort()).toEqual([
			"codex",
			"droid",
			"gemini",
		]);
		expect(resolveDisabledAgentIds().sort()).toEqual([
			"claude",
			"codex",
			"gemini",
		]);
	});
});
