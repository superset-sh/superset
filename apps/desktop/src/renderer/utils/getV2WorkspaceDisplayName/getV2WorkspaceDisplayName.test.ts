import { describe, expect, it } from "bun:test";
import { getV2WorkspaceDisplayName } from "./getV2WorkspaceDisplayName";

describe("getV2WorkspaceDisplayName", () => {
	it("shows the stored name", () => {
		expect(
			getV2WorkspaceDisplayName({ name: "refactor auth", branch: "main" }),
		).toBe("refactor auth");
	});

	it("falls back to the branch when the name is empty", () => {
		expect(getV2WorkspaceDisplayName({ name: "", branch: "feat/x" })).toBe(
			"feat/x",
		);
	});
});
