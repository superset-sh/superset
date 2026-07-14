import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	defaultWorktreesRoot,
	projectWorktreesRoot,
	safeResolveWorktreePath,
} from "./worktree-paths";

const ENV_KEY = "SUPERSET_WORKTREES_ROOT";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

describe("defaultWorktreesRoot", () => {
	let previous: string | undefined;

	beforeEach(() => {
		previous = process.env[ENV_KEY];
		delete process.env[ENV_KEY];
	});

	afterEach(() => {
		if (previous === undefined) delete process.env[ENV_KEY];
		else process.env[ENV_KEY] = previous;
	});

	it("falls back to the homedir default when the env var is unset", () => {
		expect(defaultWorktreesRoot()).toBe(
			join(homedir(), ".superset", "worktrees"),
		);
	});

	it("uses SUPERSET_WORKTREES_ROOT when it is set", () => {
		process.env[ENV_KEY] = "/Volumes/samsung/worktrees";
		expect(defaultWorktreesRoot()).toBe("/Volumes/samsung/worktrees");
	});

	it("trims and absolute-resolves the env var value", () => {
		process.env[ENV_KEY] = "  /Volumes/samsung/./worktrees/../worktrees  ";
		expect(defaultWorktreesRoot()).toBe(resolve("/Volumes/samsung/worktrees"));
	});

	it("ignores a whitespace-only env var and uses the homedir default", () => {
		process.env[ENV_KEY] = "   ";
		expect(defaultWorktreesRoot()).toBe(
			join(homedir(), ".superset", "worktrees"),
		);
	});
});

describe("worktreeBaseDir precedence over SUPERSET_WORKTREES_ROOT", () => {
	let previous: string | undefined;

	beforeEach(() => {
		previous = process.env[ENV_KEY];
		process.env[ENV_KEY] = "/Volumes/samsung/worktrees";
	});

	afterEach(() => {
		if (previous === undefined) delete process.env[ENV_KEY];
		else process.env[ENV_KEY] = previous;
	});

	it("lets an explicit worktreeBaseDir win in projectWorktreesRoot", () => {
		expect(projectWorktreesRoot(PROJECT_ID, "/custom/base")).toBe(
			join("/custom/base", PROJECT_ID),
		);
	});

	it("lets an explicit worktreeBaseDir win in safeResolveWorktreePath", () => {
		expect(safeResolveWorktreePath(PROJECT_ID, "feature", "/custom/base")).toBe(
			join("/custom/base", PROJECT_ID, "feature"),
		);
	});

	it("uses the env var as the default when no worktreeBaseDir is given", () => {
		expect(projectWorktreesRoot(PROJECT_ID)).toBe(
			join("/Volumes/samsung/worktrees", PROJECT_ID),
		);
	});
});
