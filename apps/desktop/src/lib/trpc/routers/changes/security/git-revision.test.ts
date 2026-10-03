import { describe, expect, test } from "bun:test";
import { gitRevisionSchema } from "./git-revision";

describe("gitRevisionSchema", () => {
	test("accepts hashes, refs and revision expressions", () => {
		for (const value of [
			"abc123",
			"HEAD",
			"HEAD~2",
			"origin/main",
			"feature/-dashes-inside",
			"refs/heads/main",
		]) {
			expect(gitRevisionSchema.safeParse(value).success).toBe(true);
		}
	});

	test("rejects revisions git would parse as options", () => {
		for (const value of [
			"-",
			"-r",
			"--output=/etc/passwd",
			"--output=./pwned",
			"-O/tmp/orderfile",
		]) {
			expect(gitRevisionSchema.safeParse(value).success).toBe(false);
		}
	});
});
