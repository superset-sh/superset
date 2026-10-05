import { describe, expect, test } from "bun:test";
import { PROJECTS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import { normalizeHostProjectRow } from "renderer/hooks/host-projects/useHostProjects/useHostProjects.utils";
import type { HostTagFolderSetting } from "renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils";
import type { ProjectCollectionPendingPresentation } from "shared/project-collections";
import { planProjectCollectionDrop } from "../../_dashboard/components/DashboardSidebar/hooks/useSidebarDnd/projectCollectionDrop";
import { getProjectCollectionOrder } from "../../utils/projectCollections/projectCollectionOrder";
import { deriveProjectCollections } from "../../utils/projectCollections/projectCollections";
import {
	enqueueProjectCollectionMutation,
	mutateProjectCollection,
	type ProjectCollectionMutationAdapter,
	type ProjectCollectionMutationState,
} from "./projectCollectionMutations";
import { replayProjectCollectionPresentations } from "./utils/replayProjectCollectionPresentations";

function setup() {
	let state: ProjectCollectionMutationState = {
		projectHosts: ["local", "remote"].map((machineId) => ({
			target: {
				machineId,
				organizationId: "org",
				hostUrl: machineId,
				isLocal: machineId === "local",
			},
			reachable: true,
			rows: ["a", "b"].map((id) =>
				normalizeHostProjectRow({ id, repoPath: `/${id}`, tags: ["team"] }),
			),
		})),
		folderHosts: ["local", "remote"].map((machineId) => ({
			target: {
				machineId,
				organizationId: "org",
				hostUrl: machineId,
				isLocal: machineId === "local",
			},
			status: "ready",
			settings: [
				{
					scope: PROJECTS_TAG_SCOPE,
					tag: "team",
					displayName: "Team",
					color: "#ff0000",
					tabOrder: 1,
				},
				{
					scope: PROJECTS_TAG_SCOPE,
					tag: "other",
					displayName: "Other",
					color: null,
					tabOrder: 3,
				},
			],
		})),
		placements: [
			{ key: "root", kind: "project", tabOrder: 0, isCollapsed: false },
			{
				key: "projects:team",
				kind: "collection",
				tabOrder: 1,
				isCollapsed: true,
			},
			{ key: "a", kind: "project", tabOrder: 1, isCollapsed: false },
			{ key: "b", kind: "project", tabOrder: 0, isCollapsed: false },
		],
	};
	const tagCalls: Array<{
		url: string;
		updates: Array<{ projectId: string; tags: string[] }>;
	}> = [];
	const settingCalls: Array<{
		url: string;
		tag: string;
		setting: HostTagFolderSetting | null;
	}> = [];
	const placementCalls: Array<{
		rows: ProjectCollectionMutationState["placements"];
		removeKeys: string[];
	}> = [];
	let invalidations = 0;
	const adapter: ProjectCollectionMutationAdapter = {
		read: () => structuredClone(state),
		publish: (next) => {
			state = structuredClone(next);
		},
		setTags: async (url, updates) => {
			tagCalls.push({ url, updates });
		},
		setSetting: async (url, tag, setting) => {
			settingCalls.push({ url, tag, setting });
		},
		writePlacements: async (rows, removeKeys) => {
			placementCalls.push({ rows, removeKeys });
		},
		invalidate: () => {
			invalidations++;
		},
	};
	return {
		adapter,
		state: () => state,
		tagCalls,
		settingCalls,
		placementCalls,
		invalidations: () => invalidations,
	};
}

describe("project collection mutations", () => {
	test("moves several projects with one batched write per replica", async () => {
		const h = setup();
		expect(
			await mutateProjectCollection(h.adapter, {
				type: "move",
				projectIds: ["a", "b", "a"],
				tag: "other",
			}),
		).toBe(true);
		expect(h.tagCalls).toHaveLength(2);
		expect(h.tagCalls[0]?.updates).toEqual([
			{ projectId: "a", tags: ["other"] },
			{ projectId: "b", tags: ["other"] },
		]);
		expect(
			h
				.state()
				.projectHosts.every((host) =>
					host.rows?.every((row) => row.tags?.[0] === "other"),
				),
		).toBe(true);
		expect(h.placementCalls).toHaveLength(1);
	});
	test("moves to root with empty tags and inserts in mixed root order", async () => {
		const h = setup();
		await mutateProjectCollection(h.adapter, {
			type: "move",
			projectIds: ["b"],
			tag: null,
			index: 1,
		});
		expect(h.tagCalls[0]?.updates).toEqual([{ projectId: "b", tags: [] }]);
		expect(h.state().placements.find((row) => row.key === "b")?.tabOrder).toBe(
			1,
		);
		expect(
			h.state().placements.find((row) => row.key === "projects:team")?.tabOrder,
		).toBe(0);
	});
	test("creation propagates empty settings, then rename and color preserve membership", async () => {
		const h = setup();
		expect(
			await mutateProjectCollection(h.adapter, {
				type: "create",
				tag: " New ",
				name: "New collection",
			}),
		).toBe(true);
		expect(h.settingCalls).toHaveLength(2);
		expect(
			h.state().folderHosts[1]?.settings.find((row) => row.tag === "new")
				?.displayName,
		).toBe("New collection");
		await mutateProjectCollection(h.adapter, {
			type: "rename",
			tag: "new",
			name: "Renamed",
		});
		await mutateProjectCollection(h.adapter, {
			type: "color",
			tag: "new",
			color: "#abcdef",
		});
		expect(
			h.state().folderHosts[0]?.settings.find((row) => row.tag === "new"),
		).toMatchObject({ displayName: "Renamed", color: "#abcdef" });
		expect(h.tagCalls).toHaveLength(0);
	});
	test("creates and moves members as one transaction", async () => {
		const h = setup();
		await mutateProjectCollection(h.adapter, {
			type: "create",
			tag: "new",
			name: "New",
			projectIds: ["a", "b"],
		});
		expect(h.tagCalls).toHaveLength(2);
		expect(h.state().projectHosts[0]?.rows?.map((row) => row.tags)).toEqual([
			["new"],
			["new"],
		]);
	});
	test("deletion clears tags and expands members at collection position in manual order", async () => {
		const h = setup();
		await mutateProjectCollection(h.adapter, { type: "delete", tag: "team" });
		expect(h.state().placements.find((row) => row.key === "b")?.tabOrder).toBe(
			0,
		);
		expect(h.state().placements.find((row) => row.key === "a")?.tabOrder).toBe(
			1,
		);
		expect(
			h.state().placements.some((row) => row.key === "projects:team"),
		).toBe(false);
		expect(h.placementCalls[0]?.removeKeys).toEqual(["projects:team"]);
		expect(h.settingCalls.every((call) => call.setting === null)).toBe(true);
		expect(h.state().projectHosts[0]?.rows?.map((row) => row.tags)).toEqual([
			[],
			[],
		]);
	});
	test("local collapse and mixed reorder do not write host data", async () => {
		const h = setup();
		await mutateProjectCollection(h.adapter, {
			type: "collapse",
			tag: "team",
			isCollapsed: false,
		});
		await mutateProjectCollection(h.adapter, {
			type: "reorder",
			keys: ["projects:other", "projects:team"],
		});
		expect(
			h.state().placements.find((row) => row.key === "projects:team"),
		).toMatchObject({ isCollapsed: false, tabOrder: 1 });
		expect(h.tagCalls).toHaveLength(0);
		expect(h.settingCalls).toHaveLength(0);
	});
	test("old and offline replicas disable moves without calls", async () => {
		for (const old of [true, false]) {
			const h = setup();
			const prior = h.state();
			if (old && prior.projectHosts[1]?.rows?.[0])
				prior.projectHosts[1].rows[0].supportsProjectTags = false;
			else if (prior.projectHosts[1]) prior.projectHosts[1].reachable = false;
			expect(
				await mutateProjectCollection(h.adapter, {
					type: "move",
					projectIds: ["a"],
					tag: "other",
				}),
			).toBe(false);
			expect(h.tagCalls).toHaveLength(0);
		}
	});
	test("optimistic state precedes host write and failure compensates successful replicas", async () => {
		const h = setup();
		const before = structuredClone(h.state());
		h.adapter.setTags = async (url, updates) => {
			h.tagCalls.push({ url, updates });
			if (updates[0]?.tags[0] === "other") {
				expect(h.state().projectHosts[0]?.rows?.[0]?.tags).toEqual(["other"]);
				if (url === "remote") throw new Error("offline");
			}
		};
		await expect(
			mutateProjectCollection(h.adapter, {
				type: "move",
				projectIds: ["a"],
				tag: "other",
			}),
		).rejects.toThrow("offline");
		expect(h.state()).toEqual(before);
		expect(h.tagCalls.at(-1)).toEqual({
			url: "local",
			updates: [{ projectId: "a", tags: ["team"] }],
		});
		expect(h.invalidations()).toBe(1);
	});
	test("setting or SQLite failure restores tags, presentation and local placements", async () => {
		for (const failure of ["setting", "sqlite"]) {
			const h = setup();
			const before = structuredClone(h.state());
			if (failure === "setting")
				h.adapter.setSetting = async (url, tag, setting) => {
					h.settingCalls.push({ url, tag, setting });
					if (url === "remote" && setting === null) throw new Error(failure);
				};
			else
				h.adapter.writePlacements = async () => {
					throw new Error(failure);
				};
			await expect(
				mutateProjectCollection(h.adapter, { type: "delete", tag: "team" }),
			).rejects.toThrow(failure);
			expect(h.state()).toEqual(before);
			expect(
				h.tagCalls
					.slice(-2)
					.every((call) =>
						call.updates.every((update) => update.tags[0] === "team"),
					),
			).toBe(true);
		}
	});
	test("missing setTags silently rolls back and disables this project's actions", async () => {
		const h = setup();
		h.adapter.setTags = async () => {
			throw new Error('No procedure found on path "project.setTags"');
		};
		expect(
			await mutateProjectCollection(h.adapter, {
				type: "move",
				projectIds: ["a"],
				tag: "other",
			}),
		).toBe(false);
		expect(h.state().projectHosts[0]?.rows?.[0]).toMatchObject({
			tags: ["team"],
			supportsProjectTags: false,
		});
	});
});

test("delete preserves mixed root position, member order and projects in another collection", async () => {
	const h = setup();
	const state = h.state();
	for (const host of state.projectHosts) {
		host.rows?.push(
			normalizeHostProjectRow({ id: "root", repoPath: "/root", tags: [] }),
		);
		host.rows?.push(
			normalizeHostProjectRow({
				id: "secondary",
				repoPath: "/secondary",
				tags: ["team", "other"],
			}),
		);
	}
	for (const host of state.folderHosts) {
		const other = host.settings.find((row) => row.tag === "other");
		if (other) other.tabOrder = -1;
	}
	await mutateProjectCollection(h.adapter, { type: "delete", tag: "team" });
	expect(h.state().placements.find((row) => row.key === "root")?.tabOrder).toBe(
		1,
	);
	expect(h.state().placements.find((row) => row.key === "b")?.tabOrder).toBe(2);
	expect(h.state().placements.find((row) => row.key === "a")?.tabOrder).toBe(3);
	expect(
		h.state().projectHosts[0]?.rows?.find((row) => row.id === "secondary")
			?.tags,
	).toEqual(["other"]);
});

test("presentation writes wait for offline hosts and converge when they return", async () => {
	const h = setup();
	let pending: ProjectCollectionPendingPresentation[] = [];
	h.adapter.writePlacements = async (
		_rows,
		_keys,
		_deletes,
		_tags,
		presentations,
	) => {
		pending = presentations ?? [];
	};
	const remote = h.state().folderHosts[1];
	if (!remote) throw new Error("Missing remote fixture");
	remote.target.hostUrl = null;
	remote.status = "offline";
	expect(
		await mutateProjectCollection(h.adapter, {
			type: "create",
			tag: "new",
			name: "New",
		}),
	).toBe(true);
	expect(h.settingCalls.map((call) => call.url)).toEqual(["local"]);
	const returned = h.state().folderHosts[1];
	if (!returned) throw new Error("Missing remote fixture");
	returned.target.hostUrl = "returned-remote";
	returned.status = "ready";
	returned.settings = returned.settings.filter((row) => row.tag !== "new");
	await replayProjectCollectionPresentations({
		hosts: h.state().folderHosts,
		pending,
		readPending: () => pending,
		enqueue: (work) => enqueueProjectCollectionMutation("test", work),
		upsert: (host, row) =>
			h.adapter.setSetting(host.target.hostUrl as string, row.tag, row.setting),
		acknowledge: async () => {
			pending = [];
		},
		invalidate: () => {},
	});
	expect(h.settingCalls.at(-1)).toMatchObject({
		url: "returned-remote",
		tag: "new",
		setting: { displayName: "New" },
	});
});

test("presentation writes skip hosts with the legacy projects scope schema", async () => {
	const h = setup();
	h.adapter.setSetting = async (url, tag, setting) => {
		h.settingCalls.push({ url, tag, setting });
		if (url === "remote")
			throw Object.assign(
				new Error("Invalid input: scope must be sessions or uuid"),
				{ data: { code: "BAD_REQUEST" } },
			);
	};
	expect(
		await mutateProjectCollection(h.adapter, {
			type: "rename",
			tag: "team",
			name: "Renamed",
		}),
	).toBe(true);
	expect(
		h.state().folderHosts[0]?.settings.find((row) => row.tag === "team")
			?.displayName,
	).toBe("Renamed");
	expect(
		h.state().folderHosts[1]?.settings.find((row) => row.tag === "team")
			?.displayName,
	).toBe("Team");
});

test("local collapse never invalidates host queries", async () => {
	const h = setup();
	await mutateProjectCollection(h.adapter, {
		type: "collapse",
		tag: "team",
		isCollapsed: false,
	});
	expect(h.invalidations()).toBe(0);
});

test("a visible drop anchor preserves hidden root predecessors", async () => {
	const h = setup();
	for (const host of h.state().projectHosts)
		host.rows?.push(
			...["hidden", "root-a", "root-b"].map((id) =>
				normalizeHostProjectRow({ id, repoPath: `/${id}`, tags: [] }),
			),
		);
	h.state().placements.push(
		...["hidden", "root-a", "root-b"].map((key, tabOrder) => ({
			key,
			tabOrder,
			kind: "project" as const,
			isCollapsed: false,
		})),
	);
	await mutateProjectCollection(h.adapter, {
		type: "move",
		projectIds: ["a"],
		tag: null,
		index: 1,
		beforeKey: "root-b",
	});
	const order = h
		.state()
		.placements.filter((row) =>
			["hidden", "root-a", "a", "root-b"].includes(row.key),
		)
		.sort((a, b) => a.tabOrder - b.tabOrder)
		.map((row) => row.key);
	expect(order).toEqual(["hidden", "root-a", "a", "root-b"]);
});

test("a visible member anchor preserves hidden collection predecessors", async () => {
	const h = setup();
	for (const host of h.state().projectHosts)
		host.rows?.push(
			normalizeHostProjectRow({
				id: "hidden",
				repoPath: "/hidden",
				tags: ["other"],
			}),
			normalizeHostProjectRow({
				id: "target",
				repoPath: "/target",
				tags: ["other"],
			}),
		);
	h.state().placements.push(
		{ key: "hidden", kind: "project", tabOrder: 0, isCollapsed: false },
		{ key: "target", kind: "project", tabOrder: 1, isCollapsed: false },
	);
	await mutateProjectCollection(h.adapter, {
		type: "move",
		projectIds: ["a"],
		tag: "other",
		index: 0,
		beforeKey: "target",
	});
	const order = h
		.state()
		.placements.filter((row) => ["hidden", "a", "target"].includes(row.key))
		.sort((a, b) => a.tabOrder - b.tabOrder)
		.map((row) => row.key);
	expect(order).toEqual(["hidden", "a", "target"]);
});

test("initial inline name gives a collection the same tag the CLI targets", async () => {
	const h = setup();
	await mutateProjectCollection(h.adapter, {
		type: "create",
		tag: "new collection",
		name: "New collection",
		projectIds: ["a"],
	});
	expect(
		await mutateProjectCollection(h.adapter, {
			type: "rename",
			tag: "new collection",
			name: "Dibsteur",
			replacementTag: "dibsteur",
		} as Parameters<typeof mutateProjectCollection>[1]),
	).toBe(true);
	expect(
		h.state().projectHosts[0]?.rows?.find((row) => row.id === "a")?.tags,
	).toEqual(["dibsteur"]);
	expect(
		h.state().folderHosts[0]?.settings.find((row) => row.tag === "dibsteur")
			?.displayName,
	).toBe("Dibsteur");
	expect(
		h.state().placements.some((row) => row.key === "projects:new collection"),
	).toBe(false);
});

test("commands queue behind reconciliation and read the previous committed state", async () => {
	const h = setup();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const enqueue = enqueueProjectCollectionMutation;
	const reconcile = enqueue("org/alice", async () => {
		await gate;
	});
	const first = enqueue("org/alice", () =>
		mutateProjectCollection(h.adapter, {
			type: "collapse",
			tag: "team",
			isCollapsed: false,
		}),
	);
	const second = enqueue("org/alice", () =>
		mutateProjectCollection(h.adapter, {
			type: "collapse",
			tag: "other",
			isCollapsed: true,
		}),
	);
	release();
	await reconcile;
	expect(await first).toBe(true);
	expect(await second).toBe(true);
	expect(
		h.state().placements.find((row) => row.key === "projects:team")
			?.isCollapsed,
	).toBe(false);
	expect(
		h.state().placements.find((row) => row.key === "projects:other")
			?.isCollapsed,
	).toBe(true);
});

test("a rejected queued write does not reject the next command", async () => {
	const enqueue = enqueueProjectCollectionMutation;
	const first = enqueue("org/bob", async () => {
		throw new Error("failed");
	});
	const second = enqueue("org/bob", async () => "saved");
	await expect(first).rejects.toThrow("failed");
	expect(await second).toBe("saved");
});

test("reordering visible collection members keeps hidden members in their manual slots", async () => {
	const h = setup();
	for (const host of h.state().projectHosts)
		host.rows?.push(
			normalizeHostProjectRow({
				id: "hidden",
				repoPath: "/hidden",
				tags: ["team"],
			}),
		);
	h.state().placements.push({
		key: "hidden",
		kind: "project",
		tabOrder: 1,
		isCollapsed: false,
	});
	const a = h.state().placements.find((row) => row.key === "a");
	if (a) a.tabOrder = 2;
	const b = h.state().placements.find((row) => row.key === "b");
	if (b) b.tabOrder = 0;
	await mutateProjectCollection(h.adapter, {
		type: "reorder",
		keys: ["a", "b"],
	});
	expect(
		h
			.state()
			.placements.filter((row) => ["hidden", "a", "b"].includes(row.key))
			.sort((a, b) => a.tabOrder - b.tabOrder)
			.map((row) => row.key),
	).toEqual(["a", "hidden", "b"]);
});

test("reordering visible root items keeps hidden empty collections in their slots", async () => {
	const h = setup();
	for (const host of h.state().projectHosts)
		host.rows?.push(
			normalizeHostProjectRow({ id: "root", repoPath: "/root", tags: [] }),
		);
	h.state().placements.push({
		key: "projects:hidden",
		kind: "collection",
		tabOrder: 1,
		isCollapsed: false,
	});
	const team = h.state().placements.find((row) => row.key === "projects:team");
	if (team) team.tabOrder = 2;
	for (const host of h.state().folderHosts)
		host.settings.push({
			scope: "projects",
			tag: "hidden",
			displayName: "Hidden",
			color: null,
			tabOrder: 1,
		});
	await mutateProjectCollection(h.adapter, {
		type: "reorder",
		keys: ["projects:other", "root", "projects:team"],
	});
	expect(
		h
			.state()
			.placements.filter((row) =>
				["projects:hidden", "root", "projects:team", "projects:other"].includes(
					row.key,
				),
			)
			.sort((a, b) => a.tabOrder - b.tabOrder)
			.map((row) => row.key),
	).toEqual(["projects:other", "projects:hidden", "root", "projects:team"]);
});

test("end drops append after hidden root rows rather than a visible numeric index", async () => {
	const h = setup();
	for (const host of h.state().projectHosts)
		host.rows?.push(
			...["root", "hidden"].map((id) =>
				normalizeHostProjectRow({ id, repoPath: `/${id}`, tags: [] }),
			),
		);
	h.state().placements.push({
		key: "hidden",
		kind: "project",
		tabOrder: 10,
		isCollapsed: false,
	});
	await mutateProjectCollection(h.adapter, {
		type: "move",
		projectIds: ["a"],
		tag: null,
		index: 2,
		beforeKey: null,
	});
	expect(
		(h.state().placements.find((row) => row.key === "a")?.tabOrder ?? -1) >
			(h.state().placements.find((row) => row.key === "hidden")?.tabOrder ?? 0),
	).toBe(true);
});

test("collection header drops append after hidden members", async () => {
	const h = setup();
	for (const host of h.state().projectHosts)
		host.rows?.push(
			normalizeHostProjectRow({
				id: "hidden",
				repoPath: "/hidden",
				tags: ["other"],
			}),
		);
	await mutateProjectCollection(h.adapter, {
		type: "move",
		projectIds: ["a"],
		tag: "other",
		index: 0,
		beforeKey: null,
	});
	expect(
		(h.state().placements.find((row) => row.key === "a")?.tabOrder ?? -1) >
			(h.state().placements.find((row) => row.key === "hidden")?.tabOrder ?? 0),
	).toBe(true);
});

test("rail drops stop at their own collection boundary", async () => {
	const h = setup();
	const state = h.state();
	for (const host of state.projectHosts)
		host.rows = [
			normalizeHostProjectRow({ id: "root-a", repoPath: "/root-a", tags: [] }),
			normalizeHostProjectRow({ id: "a", repoPath: "/a", tags: ["team"] }),
			normalizeHostProjectRow({ id: "b", repoPath: "/b", tags: ["team"] }),
			normalizeHostProjectRow({ id: "root-b", repoPath: "/root-b", tags: [] }),
		];
	for (const host of state.folderHosts)
		host.settings = host.settings.filter((row) => row.tag === "team");
	state.placements = ["root-a", "projects:team", "root-b"].map(
		(key, tabOrder) => ({
			key,
			kind: key.startsWith("projects:") ? "collection" : "project",
			tabOrder,
			isCollapsed: false,
		}),
	);
	h.adapter.publish(state);
	const command = planProjectCollectionDrop(
		{
			isRail: true,
			rootKeys: ["root-a", "projects:team", "root-b"],
			collections: [
				{ id: "projects:team", tag: "team", projectIds: ["a", "b"] },
			],
		},
		"a",
		"root-b",
	);
	if (!command) throw new Error("Missing rail command");
	expect(await mutateProjectCollection(h.adapter, command)).toBe(true);
	const next = h.state();
	const view = deriveProjectCollections({
		projects: next.projectHosts[0]?.rows ?? [],
		hostResults: next.folderHosts,
		placements: next.placements
			.filter((row) => row.kind === "collection")
			.map((row) => ({
				sectionId: row.key,
				projectId: "projects",
				tag: "team",
				name: "Team",
				color: null,
				createdAt: new Date(0),
				tabOrder: row.tabOrder,
				isCollapsed: false,
			})),
		projectPlacements: next.placements
			.filter((row) => row.kind === "project")
			.map((row) => ({
				projectId: row.key,
				tabOrder: row.tabOrder,
				isHidden: false,
			})),
	});
	expect(getProjectCollectionOrder(view.rootItems)).toEqual([
		"root-a",
		"b",
		"a",
		"root-b",
	]);
	expect(
		(next.projectHosts[0]?.rows ?? []).find((row) => row.id === "a")?.tags,
	).toEqual(["team"]);
	expect(h.tagCalls).toHaveLength(0);
});

test("repeated rail drops update the shared container order", async () => {
	const h = setup();
	const layout = {
		isRail: true,
		rootKeys: ["projects:team"],
		collections: [{ id: "projects:team", tag: "team", projectIds: ["b", "a"] }],
	};
	const first = planProjectCollectionDrop(layout, "a", "b");
	if (!first) throw new Error("Missing first drop");
	await mutateProjectCollection(h.adapter, first);
	const collection = layout.collections[0];
	if (!collection) throw new Error("Missing collection");
	collection.projectIds = ["a", "b"];
	const second = planProjectCollectionDrop(layout, "b", "a");
	if (!second) throw new Error("Missing second drop");
	await mutateProjectCollection(h.adapter, second);
	expect(
		h
			.state()
			.placements.filter(
				(row) => row.kind === "project" && ["a", "b"].includes(row.key),
			)
			.sort((a, b) => a.tabOrder - b.tabOrder)
			.map((row) => row.key),
	).toEqual(["b", "a"]);
	expect(h.tagCalls).toHaveLength(0);
});

test("offline and legacy projects reorder without a host write", async () => {
	const h = setup();
	const state = h.state();
	for (const host of state.projectHosts) {
		host.reachable = false;
		for (const row of host.rows ?? []) row.supportsProjectTags = false;
	}
	h.adapter.publish(state);
	expect(
		await mutateProjectCollection(h.adapter, {
			type: "reorder",
			keys: ["a", "b"],
		}),
	).toBe(true);
	expect(
		h
			.state()
			.placements.filter((row) => ["a", "b"].includes(row.key))
			.sort((a, b) => a.tabOrder - b.tabOrder)
			.map((row) => row.key),
	).toEqual(["a", "b"]);
	expect(h.tagCalls).toHaveLength(0);
	expect(h.settingCalls).toHaveLength(0);
});

test("deleting an empty collection records a durable deletion for its offline host", async () => {
	const h = setup();
	const before = structuredClone(h.state());
	const remote = before.folderHosts[1];
	const remoteProjects = before.projectHosts[1];
	if (!remote || !remoteProjects) throw new Error("Missing remote host");
	remote.status = "offline";
	remote.target.hostUrl = null;
	remoteProjects.rows = [];
	remoteProjects.reachable = false;
	h.adapter.publish(before);
	let pendingDeletes: unknown;
	const write = h.adapter.writePlacements;
	h.adapter.writePlacements = async (...args) => {
		pendingDeletes = args[2];
		return write(...args);
	};
	expect(
		await mutateProjectCollection(h.adapter, { type: "delete", tag: "team" }),
	).toBe(true);
	expect(pendingDeletes).toEqual([
		{ machineId: "remote", tag: "team", deletedAt: expect.any(Number) },
	]);
	expect(
		h.state().folderHosts[1]?.settings.some((row) => row.tag === "team"),
	).toBe(false);
});

test("a failed deletion queue write restores online settings and local placements", async () => {
	const h = setup();
	const before = structuredClone(h.state());
	const remote = before.folderHosts[1];
	const remoteProjects = before.projectHosts[1];
	if (!remote || !remoteProjects) throw new Error("Missing remote host");
	remote.status = "offline";
	remoteProjects.rows = [];
	h.adapter.publish(before);
	h.adapter.writePlacements = async () => {
		throw new Error("Queue is full");
	};
	await expect(
		mutateProjectCollection(h.adapter, { type: "delete", tag: "team" }),
	).rejects.toThrow("Queue is full");
	expect(h.state()).toEqual(before);
	expect(
		h.settingCalls
			.filter((call) => call.tag === "team")
			.map((call) => call.setting?.displayName ?? null),
	).toEqual([null, "Team"]);
});

function orderFromState(state: ProjectCollectionMutationState) {
	const view = deriveProjectCollections({
		projects: state.projectHosts[0]?.rows ?? [],
		hostResults: state.folderHosts,
		projectPlacements: state.placements
			.filter((row) => row.kind === "project")
			.map((row) => ({
				projectId: row.key,
				tabOrder: row.tabOrder,
				isHidden: false,
			})),
	});
	return getProjectCollectionOrder(view.rootItems);
}

test("rail and expanded reorders share project order without collections", async () => {
	const h = setup();
	for (const host of h.state().projectHosts)
		host.rows = ["a", "b", "c"].map((id) =>
			normalizeHostProjectRow({ id, repoPath: `/${id}`, tags: [] }),
		);
	for (const host of h.state().folderHosts) host.settings = [];
	h.state().placements = ["a", "b", "c"].map((key, tabOrder) => ({
		key,
		tabOrder,
		kind: "project",
		isCollapsed: false,
	}));
	const layout = { isRail: true, rootKeys: ["a", "b", "c"], collections: [] };
	const command = planProjectCollectionDrop(layout, "a", "b");
	if (!command) throw new Error("Missing rail drop");
	await mutateProjectCollection(h.adapter, command);
	expect(orderFromState(h.state())).toEqual(["b", "a", "c"]);
	await mutateProjectCollection(h.adapter, {
		type: "reorder",
		keys: ["c", "b", "a"],
	});
	expect(orderFromState(h.state())).toEqual(["c", "b", "a"]);
	expect(h.state().placements.some((row) => row.key.startsWith("rail:"))).toBe(
		false,
	);
});

for (const status of ["error", "offline", "pending"] as const) {
	test(`deletion ${status === "error" ? "does not queue" : "queues"} a ${status} host without cached project scope support`, async () => {
		const h = setup();
		const remote = h.state().folderHosts[1];
		const projects = h.state().projectHosts[1];
		if (!remote || !projects) throw new Error("Missing host");
		remote.status = status;
		remote.settings = [];
		projects.rows = [];
		let pending: unknown;
		h.adapter.writePlacements = async (_rows, _keys, rows) => {
			pending = rows;
		};
		expect(
			await mutateProjectCollection(h.adapter, {
				type: "delete",
				tag: "other",
			}),
		).toBe(true);
		expect(pending).toEqual(
			status === "error"
				? []
				: [
						{
							machineId: "remote",
							tag: "other",
							deletedAt: expect.any(Number),
						},
					],
		);
	});
}

test("rename and color skip hosts without presentation or project tags", async () => {
	const h = setup();
	const remote = h.state().folderHosts[1];
	if (!remote) throw new Error("Missing remote");
	remote.settings = [];
	const remoteProjects = h.state().projectHosts[1];
	if (remoteProjects) remoteProjects.rows = [];
	let pending: unknown;
	h.adapter.writePlacements = async (
		_rows,
		_keys,
		_deletes,
		_tags,
		presentations,
	) => {
		pending = presentations;
	};
	expect(
		await mutateProjectCollection(h.adapter, {
			type: "rename",
			tag: "team",
			name: "New",
		}),
	).toBe(true);
	expect(h.settingCalls.map((row) => row.url)).toEqual(["local"]);
	remote.status = "offline";
	expect(
		await mutateProjectCollection(h.adapter, {
			type: "color",
			tag: "team",
			color: "red",
		}),
	).toBe(true);
	expect(h.settingCalls.map((row) => row.url)).toEqual(["local", "local"]);
	expect(pending).toEqual([]);
});

for (const type of ["rename", "color"] as const) {
	test(`D1 ${type} writes hosts carrying project tags without settings`, async () => {
		const h = setup();
		for (const host of h.state().folderHosts) host.settings = [];
		await mutateProjectCollection(
			h.adapter,
			type === "rename"
				? { type, tag: "team", name: "Client" }
				: { type, tag: "team", color: "blue" },
		);
		expect(h.settingCalls.map((row) => row.url)).toEqual(["local", "remote"]);
	});
}
test("D2 an out-of-date device recolors the latest known name", async () => {
	const h = setup();
	const local = h.state().folderHosts[0]?.settings[0];
	const remote = h.state().folderHosts[1]?.settings[0];
	if (!local || !remote) throw new Error("Missing setting");
	Object.assign(local, { displayName: "Old", updatedAt: 10 });
	Object.assign(remote, { displayName: "Client X", updatedAt: 20 });
	await mutateProjectCollection(h.adapter, {
		type: "color",
		tag: "team",
		color: "blue",
	});
	expect(
		h.settingCalls.every((row) => row.setting?.displayName === "Client X"),
	).toBe(true);
});
test("D2 author queues a rename for a closed host discovered through project snapshots", async () => {
	const h = setup();
	const remote = h.state().folderHosts[1];
	if (!remote) throw new Error("Missing host");
	remote.status = "offline";
	remote.target.hostUrl = null;
	remote.settings = [];
	const pending: ProjectCollectionPendingPresentation[] = [];
	h.adapter.writePlacements = async (
		_rows,
		_keys,
		_deletes,
		_tags,
		entries,
	) => {
		pending.push(...(entries ?? []));
	};
	await mutateProjectCollection(h.adapter, {
		type: "rename",
		tag: "team",
		name: "Client X",
	});
	expect(pending).toHaveLength(1);
	expect(pending[0]?.setting.displayName).toBe("Client X");
});

test("a closed host keeps create intent across author rename and color", async () => {
	const h = setup();
	const remote = h.state().folderHosts[1];
	if (!remote) throw new Error("Missing host");
	remote.status = "offline";
	remote.target.hostUrl = null;
	let pending: ProjectCollectionPendingPresentation[] = [];
	h.adapter.writePlacements = async (_r, _k, _d, _t, rows) => {
		pending = rows ?? [];
	};
	await mutateProjectCollection(h.adapter, {
		type: "create",
		tag: "client",
		name: "Client",
	});
	await mutateProjectCollection(h.adapter, {
		type: "rename",
		tag: "client",
		name: "Client X",
	});
	await mutateProjectCollection(h.adapter, {
		type: "color",
		tag: "client",
		color: "blue",
	});
	expect(pending[0]?.setting.create).toBe(true);
});

test("deletions use one date above observed writes on ready and queued hosts", async () => {
	const h = setup();
	const state = h.state();
	const local = state.folderHosts[0];
	const remote = state.folderHosts[1];
	if (!local || !remote || !local.settings[0]) throw new Error("Missing hosts");
	const observed = Date.now() + 300_000;
	local.settings[0].updatedAt = observed;
	remote.status = "offline";
	state.projectHosts = [];
	let directDate: number | undefined;
	let queuedDate: number | undefined;
	h.adapter.setSetting = async (_url, _tag, _setting, deletedAt) => {
		directDate = deletedAt;
	};
	h.adapter.writePlacements = async (_rows, _keys, deletes) => {
		queuedDate = deletes?.[0]?.deletedAt;
	};
	expect(
		await mutateProjectCollection(h.adapter, { type: "delete", tag: "team" }),
	).toBe(true);
	expect(directDate).toBe(observed + 1);
	expect(queuedDate).toBe(observed + 1);
});
