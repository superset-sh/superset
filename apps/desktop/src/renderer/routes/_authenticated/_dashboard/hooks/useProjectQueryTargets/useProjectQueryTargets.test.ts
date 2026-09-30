import { describe, expect, test } from "bun:test";
import type { ProjectQueryTarget } from "./useProjectQueryTargets";
import { groupProjectTargetsByHost } from "./useProjectQueryTargets";

const targets: ProjectQueryTarget[] = [
	{
		projectId: "web",
		projectName: "Web",
		hostId: "host-1",
		hostUrl: "http://localhost:3201",
	},
	{
		projectId: "api",
		projectName: "API",
		hostId: "host-1",
		hostUrl: "http://localhost:3201",
	},
	{
		projectId: "docs",
		projectName: "Docs",
		hostId: "host-2",
		hostUrl: "http://localhost:3202",
	},
	{
		projectId: "orphan",
		projectName: "Orphan",
		hostId: null,
		hostUrl: null,
	},
];

describe("groupProjectTargetsByHost", () => {
	test("groups projects under their serving host", () => {
		expect(groupProjectTargetsByHost(targets)).toEqual([
			{
				key: "host-1\0web,api",
				hostId: "host-1",
				hostUrl: "http://localhost:3201",
				provider: "github",
				projects: [
					{ projectId: "web", projectName: "Web" },
					{ projectId: "api", projectName: "API" },
				],
			},
			{
				key: "host-2\0docs",
				hostId: "host-2",
				hostUrl: "http://localhost:3202",
				provider: "github",
				projects: [{ projectId: "docs", projectName: "Docs" }],
			},
			{
				key: "\0orphan",
				hostId: null,
				hostUrl: null,
				provider: "github",
				projects: [{ projectId: "orphan", projectName: "Orphan" }],
			},
		]);
	});

	test("key changes when the project set changes", () => {
		const [withBoth] = groupProjectTargetsByHost(targets.slice(0, 2));
		const [withOne] = groupProjectTargetsByHost(targets.slice(0, 1));
		expect(withBoth?.key).not.toBe(withOne?.key);
	});

	test("keeps GitLab and GitHub targets on the same host separate", () => {
		const first = targets[0];
		const second = targets[1];
		if (!first || !second) throw new Error("Missing test targets");
		const groups = groupProjectTargetsByHost([
			{ ...first, provider: "github" },
			{ ...second, provider: "gitlab" },
		]);
		expect(groups).toHaveLength(2);
		expect(groups.map((group) => group.provider)).toEqual(["github", "gitlab"]);
		expect(groups[0]?.key).not.toBe(groups[1]?.key);
	});
});
