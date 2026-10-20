import { expect, test } from "bun:test";
import { isValidBranchName } from "./isValidBranchName";

test("accepts the branch names git accepts", () => {
	for (const name of ["main", "feat/pasted-name", "release-1.2", "a/b.c/d"]) {
		expect(isValidBranchName(name)).toBe(true);
	}
});

test("rejects the branch names git rejects", () => {
	for (const name of [
		"",
		"has space",
		"a..b",
		"a~1",
		"a^",
		"a:b",
		"a?",
		"a*",
		"a[b",
		"a\\b",
		"bell\u0007",
		"a@{b",
		"@",
		"-flag",
		"/lead",
		"trail/",
		"a//b",
		"dot.",
		".hidden",
		"a/.hidden",
		"x.lock",
		"a/x.lock/b",
	]) {
		expect(isValidBranchName(name)).toBe(false);
	}
});
