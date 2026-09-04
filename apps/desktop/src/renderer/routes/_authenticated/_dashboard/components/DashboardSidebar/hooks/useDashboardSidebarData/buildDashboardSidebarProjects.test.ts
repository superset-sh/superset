import { describe, expect, it } from "bun:test";
import { SESSIONS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import {
	buildSidebarFolderKey,
	deriveTagFolders,
	EMPTY_TAG_FOLDER_CONTEXT,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import {
	buildDashboardSidebarPinnedWorkspaces,
	buildDashboardSidebarProjects,
	buildDashboardSidebarSessions,
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
		lastActivityAt: null,
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
		const { workspaces: rows } = buildDashboardSidebarSessions({
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
			sidebarSections: [],
			machineId: MACHINE_ID,
			pullRequestsByWorkspaceId: new Map(),
		});

		expect(rows.map((row) => row.id)).toEqual(["session-a", "session-b"]);
		expect(rows[0].projectId).toBeNull();
		expect(rows[0].repoUrl).toBeNull();
		expect(rows[0].branchExistsOnRemote).toBe(false);
	});

	it("files sessions into Sessions-scoped tag folders, untagged rows above the folders", () => {
		const sessionSidebarWorkspaces = [
			makeWorkspace({
				id: "tagged-late",
				projectId: null,
				type: "session",
				tabOrder: 4,
				tags: ["Zeta"],
			}),
			makeWorkspace({
				id: "untagged",
				projectId: null,
				type: "session",
				tabOrder: 3,
				tags: [],
			}),
			makeWorkspace({
				id: "multi-tag",
				projectId: null,
				type: "session",
				tabOrder: 2,
				tags: ["zeta", " Alpha "],
			}),
			makeWorkspace({
				id: "tagged-early",
				projectId: null,
				type: "session",
				tabOrder: 1,
				tags: ["ZETA"],
			}),
		];
		// Folders come from the same derivation the sidebar uses for projects;
		// derived folders sort after every stored row.
		const sidebarSections: SidebarSectionInput[] = deriveTagFolders(
			[],
			sessionSidebarWorkspaces,
			{
				...EMPTY_TAG_FOLDER_CONTEXT,
				tagSettings: [
					{
						projectId: SESSIONS_TAG_SCOPE,
						tag: "zeta",
						displayName: "Session QA",
						color: "#3b82f6",
					},
				],
			},
		).map((folder) => ({
			id: folder.sectionId,
			projectId: folder.projectId,
			name: folder.name,
			createdAt: folder.createdAt,
			isCollapsed: folder.isCollapsed,
			tabOrder: folder.tabOrder,
			color: folder.color,
			tag: folder.tag,
		}));
		const sessions = buildDashboardSidebarSessions({
			sessionSidebarWorkspaces,
			sidebarSections,
			machineId: MACHINE_ID,
			pullRequestsByWorkspaceId: new Map(),
		});

		expect(
			sessions.children.map((child) =>
				child.type === "workspace"
					? child.workspace.id
					: `${child.section.id}:[${child.section.workspaces.map((row) => row.id).join(",")}]`,
			),
		).toEqual([
			"untagged",
			`${buildSidebarFolderKey(SESSIONS_TAG_SCOPE, "alpha")}:[multi-tag]`,
			`${buildSidebarFolderKey(SESSIONS_TAG_SCOPE, "zeta")}:[tagged-early,tagged-late]`,
		]);
		const zeta = sessions.children[2];
		expect(zeta.type === "section" && zeta.section).toMatchObject({
			projectId: SESSIONS_TAG_SCOPE,
			name: "Session QA",
			color: "#3b82f6",
		});
		expect(sessions.workspaces.map((row) => row.id)).toEqual([
			"untagged",
			"multi-tag",
			"tagged-early",
			"tagged-late",
		]);
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

describe("buildDashboardSidebarProjects with tag-derived folders", () => {
	// The real pipeline: the hook derives the section union from tags first,
	// then the builder resolves membership through the same module.
	function deriveSections(
		storedSections: SidebarSectionInput[],
		workspaces: SidebarWorkspaceInput[],
	): SidebarSectionInput[] {
		return deriveTagFolders(
			storedSections.map((section) => ({
				sectionId: section.id,
				projectId: section.projectId,
				name: section.name,
				tabOrder: section.tabOrder,
				isCollapsed: section.isCollapsed,
				color: section.color,
				createdAt: section.createdAt,
				tag: section.tag,
			})),
			workspaces,
			EMPTY_TAG_FOLDER_CONTEXT,
		).map((section) => ({
			id: section.sectionId,
			projectId: section.projectId,
			name: section.name,
			createdAt: section.createdAt,
			isCollapsed: section.isCollapsed,
			tabOrder: section.tabOrder,
			color: section.color,
			tag: section.tag,
		}));
	}

	it("a folder exists and holds members because workspaces carry the tag — no local row anywhere", () => {
		const workspaces = [
			makeWorkspace({ id: "w-1", tags: ["perf"] }),
			makeWorkspace({ id: "w-2", tags: ["perf"], tabOrder: 2 }),
			makeWorkspace({ id: "w-3", tabOrder: 3 }),
		];
		const [project] = build({
			sidebarSections: deriveSections([], workspaces),
			visibleSidebarWorkspaces: workspaces,
		});

		const sections = project.children.filter(
			(child) => child.type === "section",
		);
		expect(sections).toHaveLength(1);
		const [folder] = sections;
		if (folder.type !== "section") throw new Error("expected section");
		expect(folder.section.id).toBe(buildSidebarFolderKey("project-1", "perf"));
		expect(folder.section.name).toBe("perf");
		expect(folder.section.workspaces.map((workspace) => workspace.id)).toEqual([
			"w-1",
			"w-2",
		]);

		const topLevelIds = project.children
			.filter((child) => child.type === "workspace")
			.map((child) => (child.type === "workspace" ? child.workspace.id : null));
		expect(topLevelIds).toEqual(["w-3"]);
	});

	it("tags beat a stale sectionId pointer at a tag-backed folder", () => {
		const perfKey = buildSidebarFolderKey("project-1", "perf");
		const workspaces = [
			// Untagged, but its local row still points at the perf folder: the
			// tag-backed folder ignores sectionId, so it renders top-level.
			makeWorkspace({ id: "w-stale", sectionId: perfKey, tags: [] }),
			makeWorkspace({ id: "w-tagged", tags: ["perf"], tabOrder: 2 }),
		];
		const [project] = build({
			sidebarSections: deriveSections([], workspaces),
			visibleSidebarWorkspaces: workspaces,
		});

		const folder = project.children.find((child) => child.type === "section");
		if (folder?.type !== "section") throw new Error("expected section");
		expect(folder.section.workspaces.map((workspace) => workspace.id)).toEqual([
			"w-tagged",
		]);
		const topLevelIds = project.children
			.filter((child) => child.type === "workspace")
			.map((child) => (child.type === "workspace" ? child.workspace.id : null));
		expect(topLevelIds).toEqual(["w-stale"]);
	});

	it("a legacy folder keeps owning members via sectionId when no tags resolve", () => {
		const workspaces = [
			makeWorkspace({ id: "w-legacy", sectionId: "section-1" }),
		];
		const [project] = build({
			sidebarSections: deriveSections([makeSection()], workspaces),
			visibleSidebarWorkspaces: workspaces,
		});

		const folder = project.children.find((child) => child.type === "section");
		if (folder?.type !== "section") throw new Error("expected section");
		expect(folder.section.id).toBe("section-1");
		expect(folder.section.workspaces.map((workspace) => workspace.id)).toEqual([
			"w-legacy",
		]);
	});

	it("a workspace row with the tags field ABSENT renders exactly like an untagged one", () => {
		const legacyWorkspace = makeWorkspace({ id: "w-old" });
		// Simulate a row served by an older host: the field is absent.
		delete (legacyWorkspace as { tags?: unknown }).tags;
		const [project] = build({
			sidebarSections: deriveSections([], [legacyWorkspace]),
			visibleSidebarWorkspaces: [legacyWorkspace],
		});

		expect(project.children).toHaveLength(1);
		expect(project.children[0]?.type).toBe("workspace");
	});

	it("a customised stored row wins over deriving a duplicate folder for the same tag", () => {
		const storedRow = makeSection({
			id: buildSidebarFolderKey("project-1", "perf"),
			name: "perf",
			color: "#ff0000",
			tabOrder: 1,
			tag: "perf",
		});
		const workspaces = [makeWorkspace({ id: "w-1", tags: ["perf"] })];
		const [project] = build({
			sidebarSections: deriveSections([storedRow], workspaces),
			visibleSidebarWorkspaces: workspaces,
		});

		const sections = project.children.filter(
			(child) => child.type === "section",
		);
		expect(sections).toHaveLength(1);
		const [folder] = sections;
		if (folder.type !== "section") throw new Error("expected section");
		expect(folder.section.color).toBe("#ff0000");
		expect(folder.section.workspaces.map((workspace) => workspace.id)).toEqual([
			"w-1",
		]);
		// Members inherit the customised folder colour.
		expect(folder.section.workspaces[0]?.accentColor).toBe("#ff0000");
	});
});
