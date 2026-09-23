import { describe, expect, it } from "bun:test";
import { applyProjectGroups } from "renderer/hooks/host-projects/useGroupedProjects";
import type { HostProjectGroup } from "renderer/hooks/host-projects/useHostProjectGroups/useHostProjectGroups.utils";
import {
	buildDashboardSidebarProjects,
	type SidebarProjectInput,
	type SidebarWorkspaceInput,
} from "./buildDashboardSidebarProjects";

const MACHINE_ID = "machine-1";
const DATE = new Date("2026-01-01T00:00:00.000Z");

function makeProject(
	overrides: Partial<SidebarProjectInput> = {},
): SidebarProjectInput {
	return {
		id: "project-api",
		name: "api",
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

function makeWorkspace(
	overrides: Partial<SidebarWorkspaceInput> = {},
): SidebarWorkspaceInput {
	return {
		id: "workspace-1",
		projectId: "project-api",
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

function makeGroup(
	id: string,
	name: string,
	memberProjectIds: string[],
): HostProjectGroup {
	return {
		id,
		hostId: MACHINE_ID,
		name,
		icon: null,
		color: null,
		createdAt: 1,
		updatedAt: 1,
		members: memberProjectIds.map((projectId, position) => ({
			id: `${id}-m${position}`,
			groupId: id,
			projectId,
			position,
			folder: projectId,
			baseBranch: null,
		})),
	};
}

function build(sidebarProjects: SidebarProjectInput[]) {
	return buildDashboardSidebarProjects({
		sidebarProjects,
		sidebarSections: [],
		visibleSidebarWorkspaces: [makeWorkspace()],
		machineId: MACHINE_ID,
		pullRequestsByWorkspaceId: new Map(),
	});
}

describe("a project backfilled from a single repository", () => {
	it("renders exactly as the repository did before it had a container", () => {
		const projects = [makeProject()];
		const flagOff = build(projects);
		const flagOn = build(
			applyProjectGroups(projects, [
				makeGroup("group-api", "api", ["project-api"]),
			]),
		);

		expect(flagOn.map(({ groupId, repoCount, ...project }) => project)).toEqual(
			flagOff,
		);
		expect(flagOn[0]?.repoCount).toBe(1);
		expect(flagOn[0]?.groupId).toBe("group-api");
	});

	it("keeps rendering when no host has grouped it yet", () => {
		const grouped = applyProjectGroups([makeProject()], []);

		expect(grouped).toHaveLength(1);
		expect(grouped[0]).toMatchObject({
			id: "project-api",
			name: "api",
			groupId: null,
			repoCount: 1,
		});
	});
});

describe("a project over several repositories", () => {
	it("renders once, under its own name, counting its source folders", () => {
		const grouped = applyProjectGroups(
			[makeProject(), makeProject({ id: "project-web", name: "web" })],
			[makeGroup("group-platform", "Platform", ["project-api", "project-web"])],
		);

		expect(grouped).toHaveLength(1);
		expect(grouped[0]?.id).toBe("project-api");
		expect(grouped[0]?.name).toBe("Platform");
		expect(grouped[0]?.repoCount).toBe(2);
	});

	it("still renders a source folder that is a project in its own right", () => {
		const grouped = applyProjectGroups(
			[makeProject(), makeProject({ id: "project-web", name: "web" })],
			[
				makeGroup("group-platform", "Platform", ["project-api", "project-web"]),
				makeGroup("group-web", "web", ["project-web"]),
			],
		);

		expect(grouped.map((project) => project.name)).toEqual(["Platform", "web"]);
	});
});

describe("a project whose own folder has no remote", () => {
	it("takes the avatar of the first source folder that has one", () => {
		const grouped = applyProjectGroups(
			[
				makeProject({ id: "project-town", name: "town", iconUrl: null }),
				makeProject({
					id: "project-roster",
					name: "roster",
					iconUrl: "https://github.com/acme.png?size=64",
				}),
			],
			[
				makeGroup("group-samplee", "samplee", [
					"project-town",
					"project-roster",
				]),
			],
		);

		expect(grouped).toHaveLength(1);
		expect(grouped[0]?.iconUrl).toBe("https://github.com/acme.png?size=64");
	});

	it("keeps its own avatar when it has one", () => {
		const grouped = applyProjectGroups(
			[
				makeProject({
					id: "project-town",
					name: "town",
					iconUrl: "https://github.com/town.png?size=64",
				}),
				makeProject({
					id: "project-roster",
					name: "roster",
					iconUrl: "https://github.com/acme.png?size=64",
				}),
			],
			[
				makeGroup("group-samplee", "samplee", [
					"project-town",
					"project-roster",
				]),
			],
		);

		expect(grouped[0]?.iconUrl).toBe("https://github.com/town.png?size=64");
	});
});
