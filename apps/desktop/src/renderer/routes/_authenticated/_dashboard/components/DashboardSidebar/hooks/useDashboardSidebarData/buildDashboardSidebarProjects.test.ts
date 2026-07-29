import { describe, expect, it } from "bun:test";
import {
	buildDashboardSidebarPinnedWorkspaces,
	buildDashboardSidebarProjects,
	partitionSidebarWorkspacesByPinned,
	type SidebarProjectInput,
	type SidebarSectionInput,
	type SidebarWorkspaceInput,
} from "./buildDashboardSidebarProjects";

const MACHINE_ID = "machine-1";
const DATE = new Date("2026-01-01T00:00:00.000Z");

function makeProject(
	overrides: Partial<SidebarProjectInput> = {},
): SidebarProjectInput {
	return {
		id: "project-1",
		name: "Project",
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		createdAt: DATE,
		updatedAt: DATE,
		isCollapsed: false,
		...overrides,
	};
}

function makeSection(
	overrides: Partial<SidebarSectionInput> = {},
): SidebarSectionInput {
	return {
		id: "section-1",
		projectId: "project-1",
		name: "Section",
		createdAt: DATE,
		isCollapsed: false,
		tabOrder: 1,
		color: "#abcdef",
		...overrides,
	};
}

function makeWorkspace(
	overrides: Partial<SidebarWorkspaceInput> = {},
): SidebarWorkspaceInput {
	return {
		id: "workspace-1",
		projectId: "project-1",
		hostId: MACHINE_ID,
		type: "worktree",
		hostIsOnline: true,
		name: "Workspace",
		branch: "main",
		taskId: null,
		createdAt: DATE,
		updatedAt: DATE,
		tabOrder: 1,
		sectionId: null,
		pinnedAt: null,
		pendingTransaction: null,
		...overrides,
	};
}

function build(params: {
	sidebarProjects?: SidebarProjectInput[];
	sidebarSections?: SidebarSectionInput[];
	visibleSidebarWorkspaces?: SidebarWorkspaceInput[];
}) {
	return buildDashboardSidebarProjects({
		sidebarProjects: params.sidebarProjects ?? [makeProject()],
		sidebarSections: params.sidebarSections ?? [],
		visibleSidebarWorkspaces: params.visibleSidebarWorkspaces ?? [],
		machineId: MACHINE_ID,
		pullRequestsByWorkspaceId: new Map(),
	});
}

describe("buildDashboardSidebarProjects", () => {
	it("places a workspace inside the section it belongs to", () => {
		const [project] = build({
			sidebarSections: [makeSection({ id: "section-1", tabOrder: 1 })],
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "workspace-1", sectionId: "section-1" }),
			],
		});

		expect(project.children).toHaveLength(1);
		const [child] = project.children;
		expect(child.type).toBe("section");
		if (child.type !== "section") throw new Error("expected section");
		expect(child.section.workspaces.map((workspace) => workspace.id)).toEqual([
			"workspace-1",
		]);
	});

	it("renders an orphaned-section workspace at top level instead of dropping it", () => {
		const [project] = build({
			sidebarSections: [makeSection({ id: "section-1", tabOrder: 1 })],
			visibleSidebarWorkspaces: [
				makeWorkspace({
					id: "orphan",
					sectionId: "section-deleted",
					tabOrder: 1,
				}),
			],
		});

		const topLevelWorkspaceIds = project.children
			.filter((child) => child.type === "workspace")
			.map((child) => (child.type === "workspace" ? child.workspace.id : null));
		expect(topLevelWorkspaceIds).toContain("orphan");

		const allRenderedIds = project.children.flatMap((child) =>
			child.type === "section"
				? child.section.workspaces.map((workspace) => workspace.id)
				: [child.workspace.id],
		);
		expect(allRenderedIds).toContain("orphan");
	});

	it("orders sections by tabOrder and places each workspace in its section", () => {
		const sections = [
			makeSection({ id: "section-a", name: "A", tabOrder: 2 }),
			makeSection({ id: "section-b", name: "B", tabOrder: 1 }),
		];
		const [project] = build({
			sidebarSections: sections,
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "ws-in-b", sectionId: "section-b", tabOrder: 1 }),
			],
		});

		const sectionB = project.children.find(
			(child) => child.type === "section" && child.section.id === "section-b",
		);
		expect(sectionB?.type).toBe("section");
		if (sectionB?.type !== "section") throw new Error("expected section-b");
		expect(
			sectionB.section.workspaces.map((workspace) => workspace.id),
		).toEqual(["ws-in-b"]);
		expect(
			project.children
				.filter((child) => child.type === "section")
				.map((child) => (child.type === "section" ? child.section.id : null)),
		).toEqual(["section-b", "section-a"]);
	});

	it("orders multiple orphaned workspaces by tabOrder above the sections", () => {
		const [project] = build({
			sidebarSections: [makeSection({ id: "section-1", tabOrder: 5 })],
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "orphan-late", sectionId: "gone", tabOrder: 3 }),
				makeWorkspace({ id: "orphan-early", sectionId: "gone", tabOrder: 1 }),
			],
		});

		const renderedTopLevel = project.children.map((child) =>
			child.type === "section"
				? `section:${child.section.id}`
				: child.workspace.id,
		);
		expect(renderedTopLevel).toEqual([
			"orphan-early",
			"orphan-late",
			"section:section-1",
		]);
	});
});

describe("partitionSidebarWorkspacesByPinned", () => {
	it("splits pinned rows out and sorts them by pin time ascending", () => {
		const { pinned, unpinned } = partitionSidebarWorkspacesByPinned([
			makeWorkspace({ id: "unpinned-1" }),
			makeWorkspace({ id: "pinned-late", pinnedAt: 2000 }),
			makeWorkspace({ id: "unpinned-2" }),
			makeWorkspace({ id: "pinned-early", pinnedAt: 1000 }),
		]);

		expect(pinned.map((workspace) => workspace.id)).toEqual([
			"pinned-early",
			"pinned-late",
		]);
		expect(unpinned.map((workspace) => workspace.id)).toEqual([
			"unpinned-1",
			"unpinned-2",
		]);
	});
});

describe("buildDashboardSidebarPinnedWorkspaces", () => {
	it("decorates pinned rows with project identity and drops project-less rows", () => {
		const rows = buildDashboardSidebarPinnedWorkspaces({
			pinnedSidebarWorkspaces: [
				makeWorkspace({ id: "pinned-1", pinnedAt: 1000 }),
				makeWorkspace({
					id: "pinned-orphan",
					projectId: "removed-project",
					pinnedAt: 2000,
				}),
			],
			sidebarProjects: [
				makeProject({ id: "project-1", name: "Superset", iconUrl: "icon.png" }),
			],
			machineId: MACHINE_ID,
			pullRequestsByWorkspaceId: new Map(),
		});

		expect(rows.map((row) => row.id)).toEqual(["pinned-1"]);
		expect(rows[0].projectName).toBe("Superset");
		expect(rows[0].projectIconUrl).toBe("icon.png");
		expect(rows[0].isPinned).toBe(true);
	});
});
