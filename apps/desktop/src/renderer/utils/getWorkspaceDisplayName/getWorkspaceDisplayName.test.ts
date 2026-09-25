import { describe, expect, it } from "bun:test";
import { getWorkspaceDisplayName } from "./getWorkspaceDisplayName";

describe("getWorkspaceDisplayName", () => {
	it("shows the stored name", () => {
		expect(
			getWorkspaceDisplayName({ name: "refactor auth", branch: "main" }),
		).toBe("refactor auth");
	});

	it("falls back to the branch when the name is empty", () => {
		expect(getWorkspaceDisplayName({ name: "", branch: "feat/x" })).toBe(
			"feat/x",
		);
	});
});
