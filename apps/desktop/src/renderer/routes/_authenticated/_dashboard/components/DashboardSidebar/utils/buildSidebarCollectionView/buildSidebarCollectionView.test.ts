import { describe, expect, test } from "bun:test";
import type { ProjectCollectionRootItem } from "renderer/routes/_authenticated/utils/projectCollections/projectCollections";
import type { DashboardSidebarProject } from "../../types";
import { buildSidebarCollectionView } from "./buildSidebarCollectionView";

function project(id: string, name = id): DashboardSidebarProject {
	return {
		id,
		name,
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		color: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		isCollapsed: true,
		children: [],
	};
}
const backend = project("a", "Backend");
const frontend = project("b", "Frontend");
const personal = project("root", "Personal");
const projects = [backend, frontend, personal];
const items: ProjectCollectionRootItem<{ id: string }>[] = [
	{ type: "project", project: { id: "root" }, tabOrder: 0 },
	{
		type: "collection",
		tabOrder: 1,
		collection: {
			id: "projects:team",
			tag: "team",
			name: "Dibsteur",
			color: "#ef4444",
			tabOrder: 1,
			isCollapsed: true,
			projects: [{ id: "b" }, { id: "a" }],
		},
	},
];

describe("sidebar collection view", () => {
	test("preserves root and member order for workspace shortcuts", () => {
		const view = buildSidebarCollectionView(projects, items, "");
		expect(view.projects.map((row) => row.id)).toEqual(["root", "b", "a"]);
		expect(view.visibleProjects.map((row) => row.id)).toEqual(["root"]);
	});
	test("searching a collection reveals all its projects without persisting collapse", () => {
		const view = buildSidebarCollectionView(projects, items, "dibsteur");
		expect(view.visibleProjects.map((row) => row.id)).toEqual(["b", "a"]);
		expect(view.projects.every((row) => !row.isCollapsed)).toBe(true);
		expect(
			items[1]?.type === "collection" && items[1].collection.isCollapsed,
		).toBe(true);
		expect(projects.every((row) => row.isCollapsed)).toBe(true);
	});
	test("searching a project only reveals matching members", () => {
		const view = buildSidebarCollectionView(projects, items, "backend");
		expect(view.projects.map((row) => row.id)).toEqual(["a"]);
		expect(view.visibleProjects.map((row) => row.id)).toEqual(["a"]);
	});
	test("searching a workspace preserves its owning collection", () => {
		const withWorkspace = {
			...backend,
			children: [
				{
					type: "workspace" as const,
					workspace: { id: "ws", name: "Fix login" },
				},
			],
		} as DashboardSidebarProject;
		const view = buildSidebarCollectionView(
			[withWorkspace, frontend, personal],
			items,
			"login",
		);
		expect(view.rootItems[0]?.type).toBe("collection");
		expect(view.visibleProjects[0]?.id).toBe("a");
		expect(view.visibleProjects[0]?.children).toEqual(withWorkspace.children);
	});
	test("keeps empty collections and filters them by name", () => {
		const empty: ProjectCollectionRootItem<{ id: string }>[] = [
			{
				...(items[1] as Extract<
					(typeof items)[number],
					{ type: "collection" }
				>),
				type: "collection",
				collection: {
					...(
						items[1] as Extract<(typeof items)[number], { type: "collection" }>
					).collection,
					projects: [],
				},
			},
		];
		expect(buildSidebarCollectionView([], empty, "").rootItems).toHaveLength(1);
		expect(
			buildSidebarCollectionView([], empty, "dibsteur").rootItems,
		).toHaveLength(1);
		expect(
			buildSidebarCollectionView([], empty, "unknown").rootItems,
		).toHaveLength(0);
	});
	test("does not render missing members or duplicate projects", () => {
		const view = buildSidebarCollectionView([backend], items, "");
		expect(view.projects.map((row) => row.id)).toEqual(["a"]);
	});
});
