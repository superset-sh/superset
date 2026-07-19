import { describe, expect, test } from "bun:test";
import { selectEffectiveBaseBranch } from "./select-effective-base-branch";

describe("selectEffectiveBaseBranch", () => {
	test("prefers the configured worktree branch over the repository default", () => {
		expect(selectEffectiveBaseBranch("release", "main")).toBe("release");
	});

	test("falls back to the repository default", () => {
		expect(selectEffectiveBaseBranch(null, "master")).toBe("master");
	});
});
