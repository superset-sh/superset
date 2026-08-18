import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	assertRemovableProfileDir,
	removeClaudeProfile,
	removeCodexHome,
} from "./profile-remove";

// These guard a recursive delete — every rejection here is load-bearing.
describe("assertRemovableProfileDir", () => {
	it("rejects anything outside the home dir", () => {
		expect(() => assertRemovableProfileDir("/")).toThrow(/outside the home/);
		expect(() => assertRemovableProfileDir("/tmp/claude-profile")).toThrow(
			/outside the home/,
		);
		expect(() => assertRemovableProfileDir(homedir())).toThrow();
	});

	it("rejects every system-default home", () => {
		for (const dir of [
			join(homedir(), ".claude"),
			join(homedir(), ".config", "claude"),
			join(homedir(), ".config"),
			join(homedir(), ".codex"),
		]) {
			expect(() => assertRemovableProfileDir(dir)).toThrow(/system-default/);
		}
	});

	it("rejects path traversal that resolves to a protected dir", () => {
		expect(() =>
			assertRemovableProfileDir(
				join(homedir(), ".claude-work", "..", ".claude"),
			),
		).toThrow(/system-default/);
		expect(() =>
			assertRemovableProfileDir(join(homedir(), ".claude-work", "..", "..")),
		).toThrow(/outside the home/);
	});

	it("accepts a profile dir under the home dir", () => {
		const dir = join(homedir(), ".claude-unittest-profile");
		expect(assertRemovableProfileDir(dir)).toBe(dir);
	});
});

describe("remove functions refuse protected dirs before touching the disk", () => {
	it("removeClaudeProfile throws on the default home", async () => {
		await expect(
			removeClaudeProfile(join(homedir(), ".claude")),
		).rejects.toThrow(/system-default/);
	});

	it("removeCodexHome throws on the default home", async () => {
		await expect(removeCodexHome(join(homedir(), ".codex"))).rejects.toThrow(
			/system-default/,
		);
	});
});
