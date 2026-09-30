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

describe("repository provider identity", () => {
	test("normalizes an older GitHub host row", () => {
		const row = normalizeHostProjectRow({
			id: "github-project",
			repoPath: "/tmp/widgets",
			repoUrl: "https://github.com/acme/widgets",
		});
		expect(row.provider).toBe("github");
		expect(row.instance).toBe("https://github.com");
	});

	test("preserves a GitLab instance in project change events", () => {
		const existing = normalizeHostProjectRow({
			id: "gitlab-project",
			repoPath: "/tmp/widgets",
		});
		const next = applyProjectChangedEvent(
			[existing],
			{
				eventType: "updated",
				project: {
					id: "gitlab-project",
					name: "widgets",
					repoPath: "/tmp/widgets",
					provider: "gitlab",
					instance: "https://gitlab.example.com:8443",
					repoOwner: "team/subgroup",
					repoName: "widgets",
					repoUrl: "https://gitlab.example.com:8443/team/subgroup/widgets",
					worktreeBaseDir: null,
					icon: null,
					color: null,
					createdAt: 1,
					updatedAt: 2,
				},
			},
			"gitlab-project",
		);
		expect(next?.[0]?.provider).toBe("gitlab");
		expect(next?.[0]?.instance).toBe("https://gitlab.example.com:8443");
	});
});
