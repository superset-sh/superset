import { describe, expect, test } from "bun:test";
import { resolveWorkspaceSectionId } from "./resolve-section";

describe("resolveWorkspaceSectionId", () => {
	test("returns null when no section is requested", () => {
		expect(
			resolveWorkspaceSectionId({
				requestedSectionId: undefined,
				section: undefined,
				projectId: "p1",
			}),
		).toBeNull();

		expect(
			resolveWorkspaceSectionId({
				requestedSectionId: null,
				section: undefined,
				projectId: "p1",
			}),
		).toBeNull();
	});

	test("returns the section id when it exists in the same project", () => {
		expect(
			resolveWorkspaceSectionId({
				requestedSectionId: "s1",
				section: { id: "s1", projectId: "p1" },
				projectId: "p1",
			}),
		).toBe("s1");
	});

	test("throws when the requested section does not exist", () => {
		expect(() =>
			resolveWorkspaceSectionId({
				requestedSectionId: "missing",
				section: undefined,
				projectId: "p1",
			}),
		).toThrow('Section "missing" not found');
	});

	test("throws when the section belongs to a different project", () => {
		// Reproduces the requirement from #5175: a workspace must not be created
		// into a group that lives in another project.
		expect(() =>
			resolveWorkspaceSectionId({
				requestedSectionId: "s1",
				section: { id: "s1", projectId: "other-project" },
				projectId: "p1",
			}),
		).toThrow("different project");
	});
});
