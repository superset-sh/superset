import { describe, expect, it } from "bun:test";
import { claudeKeychainAccounts } from "./profiles";

// Claude Code keys its Keychain items on these names; a miss reads a sibling
// item (or nothing) and the login disappears from the quota panel.
describe("claudeKeychainAccounts", () => {
	it("uses $USER alone when it is set, as the CLI does", () => {
		expect(claudeKeychainAccounts({ USER: "avi" }, () => "passwd")).toEqual([
			"avi",
		]);
	});

	it("without $USER probes the passwd name and Bun's 'unknown' identity", () => {
		expect(claudeKeychainAccounts({}, () => "passwd")).toEqual([
			"passwd",
			"unknown",
		]);
		expect(claudeKeychainAccounts({ USER: "" }, () => "passwd")).toEqual([
			"passwd",
			"unknown",
		]);
	});

	it("swaps an unusable name for the CLI's fixed fallback", () => {
		expect(claudeKeychainAccounts({ USER: "not valid!" }, () => "x")).toEqual([
			"claude-code-user",
		]);
		expect(
			claudeKeychainAccounts({}, () => {
				throw new Error("no passwd entry");
			}),
		).toEqual(["claude-code-user", "unknown"]);
	});
});
