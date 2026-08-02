import { describe, expect, it } from "bun:test";
import { assertSectionMatchesProject } from "./section-project-guard";

describe("assertSectionMatchesProject", () => {
	it("passes when the section belongs to the project", () => {
		expect(() =>
			assertSectionMatchesProject({ id: "s1", projectId: "p1" }, "p1"),
		).not.toThrow();
	});

	it("throws when the section was not found", () => {
		expect(() => assertSectionMatchesProject(undefined, "p1")).toThrow(
			/section/i,
		);
	});

	it("throws when the section belongs to a different project", () => {
		expect(() =>
			assertSectionMatchesProject({ id: "s1", projectId: "p2" }, "p1"),
		).toThrow(/project/i);
	});
});
