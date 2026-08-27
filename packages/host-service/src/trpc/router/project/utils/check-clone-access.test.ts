import { describe, expect, test } from "bun:test";
import { classifyGitFailure } from "./check-clone-access";

describe("classifyGitFailure", () => {
	test("terminal-prompts-disabled clone failures are auth", () => {
		expect(
			classifyGitFailure(
				"Cloning into '/Users/agenthub/dev/usv-apps'...\nfatal: could not read Username for 'https://github.com': terminal prompts disabled",
			),
		).toBe("auth");
	});

	test("ssh publickey rejections are auth", () => {
		expect(
			classifyGitFailure("git@github.com: Permission denied (publickey)."),
		).toBe("auth");
	});

	test("github's private/missing repo answer is not_found", () => {
		expect(classifyGitFailure("remote: Repository not found.")).toBe(
			"not_found",
		);
	});

	test("dns failures are network", () => {
		expect(
			classifyGitFailure(
				"fatal: unable to access 'https://github.com/a/b.git/': Could not resolve host: github.com",
			),
		).toBe("network");
	});

	test("anything unrecognized stays unknown", () => {
		expect(classifyGitFailure("fatal: something novel happened")).toBe(
			"unknown",
		);
	});
});
