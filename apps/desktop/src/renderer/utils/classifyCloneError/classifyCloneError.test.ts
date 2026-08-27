import { describe, expect, test } from "bun:test";
import { classifyCloneError } from "./classifyCloneError";

describe("classifyCloneError", () => {
	test("terminal-prompts-disabled failures ask for gh sign-in", () => {
		const result = classifyCloneError(
			new Error(
				"Failed to clone repository: fatal: could not read Username for 'https://github.com': terminal prompts disabled",
			),
		);
		expect(result.needsGhAuth).toBe(true);
	});

	test("ssh publickey failures steer to https + gh", () => {
		const result = classifyCloneError(
			new Error("git@github.com: Permission denied (publickey)."),
		);
		expect(result.needsGhAuth).toBe(true);
		expect(result.message).toContain("HTTPS");
	});

	test("unrelated errors pass through verbatim without gh advice", () => {
		const result = classifyCloneError(new Error("disk full"));
		expect(result).toEqual({ message: "disk full", needsGhAuth: false });
	});

	test("non-Error values fall back to a generic message", () => {
		expect(classifyCloneError("boom").message).toBe(
			"Failed to clone repository",
		);
	});
});
