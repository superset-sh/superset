import { describe, expect, it } from "bun:test";
import { resolveBulkWorkspaceSectionMenuState } from "./bulkWorkspaceMoveActions";

describe("resolveBulkWorkspaceSectionMenuState", () => {
	it("renders cached sections before the live query is ready", () => {
		expect(
			resolveBulkWorkspaceSectionMenuState([{ id: "cached" }], false),
		).toBe("populated");
	});

	it("renders loading only when no sections are available yet", () => {
		expect(resolveBulkWorkspaceSectionMenuState(undefined, false)).toBe(
			"loading",
		);
		expect(resolveBulkWorkspaceSectionMenuState([], false)).toBe("loading");
	});

	it("renders empty only after the query is ready with no sections", () => {
		expect(resolveBulkWorkspaceSectionMenuState([], true)).toBe("empty");
	});
});
