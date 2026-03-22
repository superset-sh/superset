import { describe, expect, it } from "bun:test";
import { getPresetProjectTargetLabel } from "./preset-project-options";

const projectOptionsById = new Map([
	[
		"project-a",
		{
			id: "project-a",
			name: "Project A",
			color: "#111111",
			mainRepoPath: "/repos/project-a",
		},
	],
	[
		"project-b",
		{
			id: "project-b",
			name: "Project B",
			color: "#222222",
			mainRepoPath: "/repos/project-b",
		},
	],
]);

describe("getPresetProjectTargetLabel", () => {
	it("returns the project name when exactly one known project is targeted", () => {
		expect(getPresetProjectTargetLabel(["project-a"], projectOptionsById)).toBe(
			"Project A",
		);
	});

	it("keeps the multi-project count when some targeted projects are stale", () => {
		expect(
			getPresetProjectTargetLabel(
				["project-a", "missing-project"],
				projectOptionsById,
			),
		).toBe("2 projects");
	});
});
