import { describe, expect, it } from "bun:test";
import type { ActivePaneStatus } from "shared/tabs-types";
import type { DashboardSidebarWorkspacePullRequest } from "../../types";
import type {
	SidebarProjectInput,
	SidebarWorkspaceInput,
} from "./buildDashboardSidebarProjects";
import { buildDashboardSidebarStatusGroups } from "./buildDashboardSidebarStatusGroups";

const MACHINE_ID = "machine-1";
const DATE = new Date("2026-01-01T00:00:00.000Z");

function makeProject(
	overrides: Partial<SidebarProjectInput> = {},
): SidebarProjectInput {
	return {
		id: "project-1",
		name: "Project One",
		slug: "project-one",
		githubRepositoryId: null,
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		createdAt: DATE,
		updatedAt: DATE,
		isCollapsed: false,
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
		branch: "feature",
		taskId: null,
		createdAt: DATE,
		updatedAt: DATE,
		tabOrder: 1,
		sectionId: null,
		pendingTransaction: null,
		...overrides,
	};
}

function pr(
	state: DashboardSidebarWorkspacePullRequest["state"],
): DashboardSidebarWorkspacePullRequest {
	return {
		url: "https://github.com/owner/repo/pull/1",
		number: 1,
		title: "PR",
		state,
		reviewDecision: null,
		checksStatus: "none",
		checks: [],
	};
}

function build(args: {
	projects: SidebarProjectInput[];
	workspaces: SidebarWorkspaceInput[];
	prs?: Record<string, DashboardSidebarWorkspacePullRequest>;
	statuses?: Record<string, ActivePaneStatus | null>;
}) {
	return buildDashboardSidebarStatusGroups({
		sidebarProjects: args.projects,
		visibleSidebarWorkspaces: args.workspaces,
		machineId: MACHINE_ID,
		pullRequestsByWorkspaceId: new Map(Object.entries(args.prs ?? {})),
		statusByWorkspaceId: new Map(Object.entries(args.statuses ?? {})),
	});
}

describe("buildDashboardSidebarStatusGroups", () => {
	it("buckets workspaces by derived status and omits empty buckets", () => {
		const groups = build({
			projects: [makeProject()],
			workspaces: [
				makeWorkspace({ id: "w-working", tabOrder: 1 }),
				makeWorkspace({ id: "w-waiting", tabOrder: 2 }),
				makeWorkspace({ id: "w-openpr", tabOrder: 3 }),
				makeWorkspace({ id: "w-done", tabOrder: 4 }),
				makeWorkspace({ id: "w-idle", tabOrder: 5 }),
			],
			prs: { "w-openpr": pr("open"), "w-done": pr("merged") },
			statuses: { "w-working": "working", "w-waiting": "review" },
		});

		expect(groups.map((g) => g.slug)).toEqual([
			"working",
			"waiting",
			"open_pr",
			"done",
			"idle",
		]);
		expect(groups.map((g) => g.id)).toEqual([
			"status:working",
			"status:waiting",
			"status:open_pr",
			"status:done",
			"status:idle",
		]);
		const idByBucket = (slug: string) =>
			groups
				.find((g) => g.slug === slug)
				?.children.map((c) =>
					c.type === "workspace" ? c.workspace.id : "section",
				);
		expect(idByBucket("working")).toEqual(["w-working"]);
		expect(idByBucket("waiting")).toEqual(["w-waiting"]);
		expect(idByBucket("open_pr")).toEqual(["w-openpr"]);
		expect(idByBucket("done")).toEqual(["w-done"]);
		expect(idByBucket("idle")).toEqual(["w-idle"]);
	});

	it("omits a bucket entirely when it has no workspaces", () => {
		const groups = build({
			projects: [makeProject()],
			workspaces: [makeWorkspace({ id: "w-idle" })],
		});
		expect(groups.map((g) => g.slug)).toEqual(["idle"]);
	});

	it("emits only workspace children (never sections) and marks groups as status kind", () => {
		const groups = build({
			projects: [makeProject()],
			workspaces: [makeWorkspace({ id: "w-1" })],
		});
		for (const group of groups) {
			expect(group.kind).toBe("status");
			expect(group.children.every((c) => c.type === "workspace")).toBe(true);
		}
	});

	it("preserves each workspace's REAL projectId (never the synthetic status:* id)", () => {
		const groups = build({
			projects: [makeProject({ id: "project-1" })],
			workspaces: [makeWorkspace({ id: "w-1", projectId: "project-1" })],
		});
		const child = groups[0]?.children[0];
		expect(child?.type).toBe("workspace");
		if (child?.type === "workspace") {
			expect(child.workspace.projectId).toBe("project-1");
		}
	});

	it("populates repoLabel from the GitHub repo name, falling back to project name", () => {
		const groups = build({
			projects: [
				makeProject({ id: "p-gh", githubRepoName: "my-repo", name: "Fancy" }),
				makeProject({ id: "p-norepo", githubRepoName: null, name: "Plain" }),
			],
			workspaces: [
				makeWorkspace({ id: "w-gh", projectId: "p-gh" }),
				makeWorkspace({ id: "w-norepo", projectId: "p-norepo" }),
			],
		});
		const labels = new Map(
			groups
				.flatMap((g) => g.children)
				.flatMap((c) =>
					c.type === "workspace"
						? [[c.workspace.id, c.workspace.repoLabel] as const]
						: [],
				),
		);
		expect(labels.get("w-gh")).toBe("my-repo");
		expect(labels.get("w-norepo")).toBe("Plain");
	});

	it("sorts permission-blocked agents first within the Working bucket", () => {
		const groups = build({
			projects: [makeProject()],
			workspaces: [
				makeWorkspace({ id: "w-working", tabOrder: 1 }),
				makeWorkspace({ id: "w-blocked", tabOrder: 2 }),
			],
			statuses: { "w-working": "working", "w-blocked": "permission" },
		});
		const working = groups.find((g) => g.slug === "working");
		expect(
			working?.children.map((c) =>
				c.type === "workspace" ? c.workspace.id : "section",
			),
		).toEqual(["w-blocked", "w-working"]);
	});

	it("drops workspaces whose project isn't in the sidebar (parity with project mode)", () => {
		const groups = build({
			projects: [makeProject({ id: "project-1" })],
			workspaces: [makeWorkspace({ id: "w-orphan", projectId: "missing" })],
		});
		expect(groups).toEqual([]);
	});
});
