import { describe, expect, test } from "bun:test";
import {
	applyProjectChangedEvent,
	getHostProjectsQueryKey,
	mergeHostProjects,
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

describe("personal project tags", () => {
	test("old hosts normalize to no tags and cannot accept collection moves", () => {
		expect(
			normalizeHostProjectRow({ id: "old", repoPath: "/old" }),
		).toMatchObject({ tags: [], supportsProjectTags: false });
		expect(
			normalizeHostProjectRow({
				id: "new",
				repoPath: "/new",
				tags: [" Team ", "team", "Other"],
			}),
		).toMatchObject({ tags: ["other", "team"], supportsProjectTags: true });
	});
	test("replicas union tags but require support from every serving host", () => {
		const hosts = [
			{
				target: {
					machineId: "local",
					organizationId: "org",
					isLocal: true,
					hostUrl: "local",
				},
				reachable: true,
				rows: [
					normalizeHostProjectRow({
						id: "one",
						repoPath: "/one",
						tags: ["local"],
					}),
				],
			},
			{
				target: {
					machineId: "remote",
					organizationId: "org",
					isLocal: false,
					hostUrl: "remote",
				},
				reachable: true,
				rows: [
					normalizeHostProjectRow({
						id: "one",
						repoPath: "/one",
						tags: ["remote"],
					}),
				],
			},
		];
		expect(mergeHostProjects({ hostResults: hosts })[0]).toMatchObject({
			tags: ["local", "remote"],
			supportsProjectTags: true,
		});
		hosts[1].rows[0] = normalizeHostProjectRow({ id: "one", repoPath: "/one" });
		expect(
			mergeHostProjects({ hostResults: hosts })[0]?.supportsProjectTags,
		).toBe(false);
	});
	test("broadcasts show only the recipient's and unknown-creator tags", () => {
		const row = normalizeHostProjectRow({
			id: "one",
			repoPath: "/one",
			tags: ["cached"],
		});
		const event = {
			eventType: "updated" as const,
			project: {
				...row,
				tagAssignments: [
					{ tag: "alice", createdByUserId: "alice" },
					{ tag: "bob", createdByUserId: "bob" },
					{ tag: "legacy", createdByUserId: null },
				],
			},
		};
		expect(
			applyProjectChangedEvent([row], event, "one", "alice")?.[0]?.tags,
		).toEqual(["alice", "legacy"]);
		expect(
			applyProjectChangedEvent([row], event, "one", "bob")?.[0]?.tags,
		).toEqual(["bob", "legacy"]);
		expect(
			applyProjectChangedEvent([row], event, "one", null)?.[0]?.tags,
		).toEqual(["cached"]);
		expect(
			applyProjectChangedEvent(
				[row],
				{ ...event, project: { ...row, tagAssignments: [] } },
				"one",
				"alice",
			)?.[0]?.tags,
		).toEqual([]);
	});
	test("ordinary events preserve known tags and deletion removes membership", () => {
		const row = normalizeHostProjectRow({
			id: "one",
			repoPath: "/one",
			tags: ["keep"],
		});
		const { tags: _, ...snapshot } = row;
		expect(
			applyProjectChangedEvent(
				[row],
				{ eventType: "updated", project: snapshot },
				"one",
				"alice",
			)?.[0]?.tags,
		).toEqual(["keep"]);
		expect(
			applyProjectChangedEvent(
				[row],
				{ eventType: "deleted", project: null },
				"one",
				"alice",
			),
		).toEqual([]);
	});
});

test("a newly created or restored project requests tags immediately when its snapshot omits them", () => {
	const { tags: _, ...row } = normalizeHostProjectRow({
		id: "one",
		repoPath: "/one",
	});
	for (const eventType of ["created", "updated"] as const) {
		const reads: string[] = [];
		applyProjectChangedEvent(
			[],
			{ eventType, project: row },
			"one",
			"alice",
			() => reads.push("list"),
		);
		expect(reads).toEqual(["list"]);
	}
});

test("project query caches are isolated between users on the same host", () => {
	const target = { organizationId: "org", machineId: "remote" };
	expect(getHostProjectsQueryKey(target, "alice")).not.toEqual(
		getHostProjectsQueryKey(target, "bob"),
	);
});

test("project snapshots isolate users", () => {
	const result = Bun.spawnSync({
		cmd: [
			process.execPath,
			"test",
			`${import.meta.dir}/fixtures/snapshot-checks.ts`,
		],
		env: { ...process.env, NODE_ENV: "test" },
	});
	expect(
		result.exitCode,
		result.stdout.toString() + result.stderr.toString(),
	).toBe(0);
});
