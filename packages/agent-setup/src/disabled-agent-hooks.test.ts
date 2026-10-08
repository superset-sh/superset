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

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "superset-hooks-"));
const ORIGINAL_HOME_DIR = process.env.SUPERSET_HOME_DIR;
const ORIGINAL_DISABLED = process.env.SUPERSET_DISABLED_AGENT_HOOKS;

beforeEach(() => {
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	delete process.env.SUPERSET_DISABLED_AGENT_HOOKS;
});

afterEach(() => {
	if (ORIGINAL_HOME_DIR === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = ORIGINAL_HOME_DIR;
	if (ORIGINAL_DISABLED === undefined)
		delete process.env.SUPERSET_DISABLED_AGENT_HOOKS;
	else process.env.SUPERSET_DISABLED_AGENT_HOOKS = ORIGINAL_DISABLED;
	fs.rmSync(TEST_HOME, { recursive: true, force: true });
	fs.mkdirSync(TEST_HOME, { recursive: true });
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
