import { describe, expect, test } from "bun:test";
import {
	applyProjectChangedEvent,
	normalizeHostProjectRow,
} from "./useHostProjects.utils";

const tagSettings = [
	{
		tag: "api",
		displayName: "API",
		color: "#ff0000",
		tabOrder: null,
	},
];

describe("old-host tag settings compatibility", () => {
	test("normalization preserves project.list tag settings", () => {
		expect(
			normalizeHostProjectRow({
				id: "project",
				repoPath: "/tmp/project",
				tagSettings,
			}).tagSettings,
		).toEqual(tagSettings);
	});

	test("project events keep the last settings when a snapshot omits them", () => {
		const existing = normalizeHostProjectRow({
			id: "project",
			repoPath: "/tmp/project",
			tagSettings,
		});
		const next = applyProjectChangedEvent(
			[existing],
			{
				eventType: "updated",
				project: {
					id: "project",
					name: "Renamed",
					repoPath: "/tmp/project",
					repoOwner: null,
					repoName: null,
					repoUrl: null,
					worktreeBaseDir: null,
					icon: null,
					color: null,
					createdAt: 1,
					updatedAt: 2,
				},
			},
			"project",
		);
		expect(next?.[0]?.tagSettings).toEqual(tagSettings);
	});
});
