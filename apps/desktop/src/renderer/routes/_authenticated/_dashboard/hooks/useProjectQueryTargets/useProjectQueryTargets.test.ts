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
				projects: [
					{ projectId: "web", projectName: "Web" },
					{ projectId: "api", projectName: "API" },
				],
			},
			{
				key: "host-2\0docs",
				hostId: "host-2",
				hostUrl: "http://localhost:3202",
				projects: [{ projectId: "docs", projectName: "Docs" }],
			},
			{
				key: "\0orphan",
				hostId: null,
				hostUrl: null,
				projects: [{ projectId: "orphan", projectName: "Orphan" }],
			},
		]);
	});

	test("key changes when the project set changes", () => {
		const [withBoth] = groupProjectTargetsByHost(targets.slice(0, 2));
		const [withOne] = groupProjectTargetsByHost(targets.slice(0, 1));
		expect(withBoth?.key).not.toBe(withOne?.key);
	});
});
