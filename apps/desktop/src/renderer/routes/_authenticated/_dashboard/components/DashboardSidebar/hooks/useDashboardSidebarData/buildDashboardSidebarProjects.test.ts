import { describe, expect, it } from "bun:test";
import type { DashboardSidebarWorkspace } from "../../types";
import {
	buildDashboardSidebarPinnedWorkspaces,
	buildDashboardSidebarProjects,
	buildDashboardSidebarSessionWorkspaces,
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
		color: null,
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
		parentWorkspaceId: null,
		lineageCollapsed: false,
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

/** Top-level workspace rows as "id:<label>" strings, sections skipped. */
function renderedWorkspaces(
	project: ReturnType<typeof build>[number],
	label: (workspace: DashboardSidebarWorkspace) => string | number,
) {
	return project.children.flatMap((child) =>
		child.type === "workspace"
			? [`${child.workspace.id}:${label(child.workspace)}`]
			: [],
	);
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

	it("keeps an ungrouped workspace top-level below a section instead of absorbing it", () => {
		const [project] = build({
			sidebarSections: [makeSection({ id: "section-1", tabOrder: 2 })],
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "ws-above", sectionId: null, tabOrder: 1 }),
				makeWorkspace({ id: "ws-member", sectionId: "section-1", tabOrder: 1 }),
				makeWorkspace({ id: "ws-below", sectionId: null, tabOrder: 3 }),
			],
		});

		expect(
			project.children.map((child) =>
				child.type === "section"
					? `section:${child.section.id}`
					: child.workspace.id,
			),
		).toEqual(["ws-above", "section:section-1", "ws-below"]);
		const section = project.children.find((child) => child.type === "section");
		if (section?.type !== "section") throw new Error("expected section");
		expect(section.section.workspaces.map((workspace) => workspace.id)).toEqual(
			["ws-member"],
		);
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

describe("lineage nesting", () => {
	it("snaps a child under its parent with lineageDepth regardless of tabOrder", () => {
		const [project] = build({
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "parent", tabOrder: 1 }),
				makeWorkspace({ id: "unrelated", tabOrder: 2 }),
				makeWorkspace({
					id: "child",
					tabOrder: 3,
					parentWorkspaceId: "parent",
				}),
			],
		});

		const rendered = renderedWorkspaces(project, (w) => w.lineageDepth);
		expect(rendered).toEqual(["parent:0", "child:1", "unrelated:0"]);
	});

	it("nests grandchildren depth-first and keeps sibling order", () => {
		const [project] = build({
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "root", tabOrder: 1 }),
				makeWorkspace({ id: "kid-a", tabOrder: 2, parentWorkspaceId: "root" }),
				makeWorkspace({ id: "kid-b", tabOrder: 4, parentWorkspaceId: "root" }),
				makeWorkspace({
					id: "grandkid",
					tabOrder: 3,
					parentWorkspaceId: "kid-a",
				}),
			],
		});

		const rendered = renderedWorkspaces(project, (w) => w.lineageDepth);
		expect(rendered).toEqual(["root:0", "kid-a:1", "grandkid:2", "kid-b:1"]);
	});

	it("marks which rail columns continue past each row (├ vs └)", () => {
		const [project] = build({
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "root", tabOrder: 1 }),
				makeWorkspace({ id: "kid-a", tabOrder: 2, parentWorkspaceId: "root" }),
				makeWorkspace({ id: "kid-b", tabOrder: 4, parentWorkspaceId: "root" }),
				makeWorkspace({
					id: "grandkid",
					tabOrder: 3,
					parentWorkspaceId: "kid-a",
				}),
			],
		});

		const rendered = renderedWorkspaces(project, (w) =>
			w.lineageGuides.map((g) => (g ? "|" : ".")).join(""),
		);
		// kid-a has a later sibling, so its column continues through the
		// grandkid's row; the grandkid is last under kid-a (└).
		expect(rendered).toEqual(["root:", "kid-a:|", "grandkid:|.", "kid-b:."]);
	});

	it("exposes thread membership: gutter, descendants, ancestors", () => {
		const [project] = build({
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "root", tabOrder: 1 }),
				makeWorkspace({ id: "kid", tabOrder: 2, parentWorkspaceId: "root" }),
				makeWorkspace({
					id: "grandkid",
					tabOrder: 3,
					parentWorkspaceId: "kid",
				}),
				makeWorkspace({ id: "loner", tabOrder: 4 }),
			],
		});

		const byId = new Map(
			project.children.flatMap((child) =>
				child.type === "workspace"
					? [[child.workspace.id, child.workspace]]
					: [],
			),
		);
		// Every row in a nested container reserves the chevron gutter.
		expect([...byId.values()].every((w) => w.lineageGutter)).toBe(true);
		expect(byId.get("root")?.lineageDescendantIds).toEqual(["kid", "grandkid"]);
		expect(byId.get("kid")?.lineageDescendantIds).toEqual(["grandkid"]);
		expect(byId.get("loner")?.lineageDescendantIds).toEqual([]);
		expect(byId.get("grandkid")?.lineageAncestorIds).toEqual(["root", "kid"]);
		expect(byId.get("loner")?.lineageAncestorIds).toEqual([]);
	});

	it("re-roots a child whose parent is not rendered in the same container", () => {
		const [project] = build({
			sidebarSections: [makeSection({ id: "section-1", tabOrder: 1 })],
			visibleSidebarWorkspaces: [
				// Parent lives in a section; child is top-level → different
				// containers, so the child renders as a top-level root.
				makeWorkspace({ id: "parent", sectionId: "section-1", tabOrder: 1 }),
				makeWorkspace({
					id: "child",
					tabOrder: 2,
					parentWorkspaceId: "parent",
				}),
				makeWorkspace({
					id: "missing-parent-child",
					tabOrder: 3,
					parentWorkspaceId: "never-rendered",
				}),
			],
		});

		const topLevel = renderedWorkspaces(project, (w) => w.lineageDepth);
		expect(topLevel).toEqual(["child:0", "missing-parent-child:0"]);
	});

	it("nests within a section's own members", () => {
		const [project] = build({
			sidebarSections: [makeSection({ id: "section-1", tabOrder: 1 })],
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "parent", sectionId: "section-1", tabOrder: 1 }),
				makeWorkspace({
					id: "child",
					sectionId: "section-1",
					tabOrder: 2,
					parentWorkspaceId: "parent",
				}),
			],
		});

		const section = project.children.find((child) => child.type === "section");
		if (section?.type !== "section") throw new Error("expected section");
		expect(
			section.section.workspaces.map(
				(workspace) => `${workspace.id}:${workspace.lineageDepth}`,
			),
		).toEqual(["parent:0", "child:1"]);
	});

	it("sets lineageChildCount on parents", () => {
		const [project] = build({
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "parent", tabOrder: 1 }),
				makeWorkspace({ id: "a", tabOrder: 2, parentWorkspaceId: "parent" }),
				makeWorkspace({ id: "b", tabOrder: 3, parentWorkspaceId: "parent" }),
			],
		});

		const rendered = renderedWorkspaces(project, (w) => w.lineageChildCount);
		expect(rendered).toEqual(["parent:2", "a:0", "b:0"]);
	});

	it("hides a collapsed parent's subtree without re-rooting it", () => {
		const [project] = build({
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "parent", tabOrder: 1, lineageCollapsed: true }),
				makeWorkspace({ id: "kid", tabOrder: 2, parentWorkspaceId: "parent" }),
				makeWorkspace({
					id: "grandkid",
					tabOrder: 3,
					parentWorkspaceId: "kid",
				}),
				makeWorkspace({ id: "unrelated", tabOrder: 4 }),
			],
		});

		const rendered = renderedWorkspaces(project, (w) => w.lineageChildCount);
		// Count is direct children only; the whole subtree stays hidden.
		expect(rendered).toEqual(["parent:1", "unrelated:0"]);
	});

	it("re-promotes cycle members instead of hiding them", () => {
		const [project] = build({
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "a", tabOrder: 1, parentWorkspaceId: "b" }),
				makeWorkspace({ id: "b", tabOrder: 2, parentWorkspaceId: "a" }),
			],
		});

		const rendered = project.children.flatMap((child) =>
			child.type === "workspace" ? [child.workspace.id] : [],
		);
		expect(rendered.sort()).toEqual(["a", "b"]);
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

describe("sessions (null projectId)", () => {
	it("never places a session row inside a project group", () => {
		const [project] = build({
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "session-1", projectId: null, type: "session" }),
				makeWorkspace({ id: "workspace-1" }),
			],
		});

		const childIds = project.children.flatMap((child) =>
			child.type === "workspace" ? [child.workspace.id] : [],
		);
		expect(childIds).toEqual(["workspace-1"]);
	});

	it("orders the Sessions section by tabOrder with no repo affordances", () => {
		const rows = buildDashboardSidebarSessionWorkspaces({
			sessionSidebarWorkspaces: [
				makeWorkspace({
					id: "session-b",
					projectId: null,
					type: "session",
					tabOrder: 2,
				}),
				makeWorkspace({
					id: "session-a",
					projectId: null,
					type: "session",
					tabOrder: 1,
				}),
			],
			machineId: MACHINE_ID,
			pullRequestsByWorkspaceId: new Map(),
		});

		expect(rows.map((row) => row.id)).toEqual(["session-a", "session-b"]);
		expect(rows[0].projectId).toBeNull();
		expect(rows[0].repoUrl).toBeNull();
		expect(rows[0].branchExistsOnRemote).toBe(false);
	});

	it("keeps a pinned session in the Pinned section with null project identity", () => {
		const rows = buildDashboardSidebarPinnedWorkspaces({
			pinnedSidebarWorkspaces: [
				makeWorkspace({
					id: "pinned-session",
					projectId: null,
					type: "session",
					pinnedAt: 1000,
				}),
			],
			sidebarProjects: [makeProject()],
			machineId: MACHINE_ID,
			pullRequestsByWorkspaceId: new Map(),
		});

		expect(rows.map((row) => row.id)).toEqual(["pinned-session"]);
		expect(rows[0].projectName).toBeNull();
		expect(rows[0].projectIconUrl).toBeNull();
	});
});
