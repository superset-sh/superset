import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	getDisabledSkillsStateFilePath,
	readSharedDisabledSkillIds,
	resolveDisabledSkillIds,
	writeSharedDisabledSkillIds,
} from "./disabled-skills";

const ORIGINAL_HOME_DIR = process.env.SUPERSET_HOME_DIR;
const ORIGINAL_DISABLED = process.env.SUPERSET_DISABLED_SKILLS;

let testHome: string;

beforeEach(() => {
	// A fresh directory per test (rather than wiping/reusing one shared dir)
	// so this file has no directory-reuse race with anything else in the suite.
	testHome = fs.mkdtempSync(path.join(os.tmpdir(), "superset-skills-"));
	process.env.SUPERSET_HOME_DIR = testHome;
	delete process.env.SUPERSET_DISABLED_SKILLS;
	// Some sibling test file in this suite mock.module()s "./paths" for the
	// whole process without restoring it, which can point this file's own
	// resolveSupersetHomeDir() at a directory another test already wrote to.
	// Every test writes before it reads today, so that's currently harmless,
	// but clear it here too so a future test that reads first doesn't
	// silently inherit foreign state.
	fs.rmSync(getDisabledSkillsStateFilePath(), { force: true });
});

afterEach(() => {
	if (ORIGINAL_HOME_DIR === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = ORIGINAL_HOME_DIR;
	if (ORIGINAL_DISABLED === undefined)
		delete process.env.SUPERSET_DISABLED_SKILLS;
	else process.env.SUPERSET_DISABLED_SKILLS = ORIGINAL_DISABLED;
	fs.rmSync(testHome, { recursive: true, force: true });
});

describe("shared disabled-skills state", () => {
	it("round-trips the disable list through the shared file", () => {
		writeSharedDisabledSkillIds(["orchestrate", "doctor"]);

		expect(readSharedDisabledSkillIds()).toEqual(["doctor", "orchestrate"]);
		expect(
			JSON.parse(fs.readFileSync(getDisabledSkillsStateFilePath(), "utf-8")),
		).toEqual({ disabledSkillIds: ["doctor", "orchestrate"] });
	});

	it("treats a missing or corrupt file as nothing disabled", () => {
		expect(readSharedDisabledSkillIds()).toEqual([]);

		fs.writeFileSync(getDisabledSkillsStateFilePath(), "{not json");
		expect(readSharedDisabledSkillIds()).toEqual([]);

		fs.writeFileSync(
			getDisabledSkillsStateFilePath(),
			JSON.stringify({ disabledSkillIds: "doctor" }),
		);
		expect(readSharedDisabledSkillIds()).toEqual([]);
	});

	it("uses the shared file when no explicit list is given", () => {
		writeSharedDisabledSkillIds(["doctor"]);

		expect(resolveDisabledSkillIds()).toEqual(["doctor"]);
	});

	it("lets an explicit list replace the file, with env on top", () => {
		writeSharedDisabledSkillIds(["doctor"]);
		process.env.SUPERSET_DISABLED_SKILLS = "orchestrate, feedback,,";

		expect(resolveDisabledSkillIds(["10x"]).sort()).toEqual([
			"10x",
			"feedback",
			"orchestrate",
		]);
		expect(resolveDisabledSkillIds().sort()).toEqual([
			"doctor",
			"feedback",
			"orchestrate",
		]);
	});
});
