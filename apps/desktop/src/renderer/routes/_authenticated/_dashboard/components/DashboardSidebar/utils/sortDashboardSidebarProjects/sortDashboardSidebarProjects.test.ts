import { describe, expect, it } from "bun:test";
import type { DashboardSidebarProjectChild } from "../../types";
import {
	makeProject,
	makeSection,
	makeWorkspace,
} from "../testProjectFixtures";
import {
	getProjectActivityTimestamp,
	sortDashboardSidebarProjectChildren,
	sortDashboardSidebarProjects,
} from "./sortDashboardSidebarProjects";

describe("getProjectActivityTimestamp", () => {
	it("uses the most recently updated workspace, including inside sections", () => {
		const project = makeProject({
			id: "p1",
			name: "Alpha",
			updatedAt: new Date("2026-06-01"),
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w1",
						name: "one",
						updatedAt: new Date("2026-02-01"),
					}),
				},
				{
					type: "section",
					section: makeSection({
						id: "s1",
						name: "Section",
						workspaces: [
							makeWorkspace({
								id: "w2",
								name: "two",
								updatedAt: new Date("2026-03-01"),
							}),
						],
					}),
				},
			],
		});
		expect(getProjectActivityTimestamp(project)).toBe(
			new Date("2026-03-01").getTime(),
		);
	});

	it("falls back to the project's own updatedAt when there are no workspaces", () => {
		const project = makeProject({
			id: "p1",
			name: "Alpha",
			updatedAt: new Date("2026-05-01"),
		});
		expect(getProjectActivityTimestamp(project)).toBe(
			new Date("2026-05-01").getTime(),
		);
	});
});

describe("sortDashboardSidebarProjects", () => {
	const older = makeProject({
		id: "p-older",
		name: "Older",
		createdAt: new Date("2026-01-01"),
		children: [
			{
				type: "workspace",
				workspace: makeWorkspace({
					id: "w1",
					name: "busy",
					updatedAt: new Date("2026-07-01"),
				}),
			},
		],
	});
	const newer = makeProject({
		id: "p-newer",
		name: "Newer",
		createdAt: new Date("2026-04-01"),
		children: [
			{
				type: "workspace",
				workspace: makeWorkspace({
					id: "w2",
					name: "idle",
					updatedAt: new Date("2026-05-01"),
				}),
			},
		],
	});

	it("returns the input untouched in manual mode", () => {
		const projects = [older, newer];
		expect(sortDashboardSidebarProjects(projects, "manual")).toBe(projects);
	});

	it("sorts newest created first in created mode", () => {
		expect(
			sortDashboardSidebarProjects([older, newer], "created").map((p) => p.id),
		).toEqual(["p-newer", "p-older"]);
	});

	it("sorts by workspace activity in updated mode", () => {
		expect(
			sortDashboardSidebarProjects([newer, older], "updated").map((p) => p.id),
		).toEqual(["p-older", "p-newer"]);
	});

	it("breaks timestamp ties by name", () => {
		const a = makeProject({ id: "p-a", name: "Apple" });
		const b = makeProject({ id: "p-b", name: "Banana" });
		expect(
			sortDashboardSidebarProjects([b, a], "created").map((p) => p.id),
		).toEqual(["p-a", "p-b"]);
	});

	// Electric collection rows carry ISO strings at runtime despite the Date
	// type; sorting must coerce them, never throw mid-render.
	it("sorts workspaces whose timestamps are ISO strings at runtime", () => {
		const stringDated = makeProject({
			id: "p-string",
			name: "StringDates",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-string",
						name: "cloud-fallback",
						updatedAt: "2026-07-01T00:00:00.000Z" as unknown as Date,
					}),
				},
			],
		});
		const dateDated = makeProject({
			id: "p-date",
			name: "DateDates",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-date",
						name: "host-served",
						updatedAt: new Date("2026-05-01"),
					}),
				},
			],
		});
		expect(
			sortDashboardSidebarProjects([dateDated, stringDated], "updated").map(
				(p) => p.id,
			),
		).toEqual(["p-string", "p-date"]);
	});

	it("sorts workspaces inside each project by updatedAt in updated mode", () => {
		const project = makeProject({
			id: "p1",
			name: "Alpha",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-old",
						name: "old",
						updatedAt: new Date("2026-02-01"),
					}),
				},
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-new",
						name: "new",
						updatedAt: new Date("2026-06-01"),
					}),
				},
			],
		});
		const [sorted] = sortDashboardSidebarProjects([project], "updated");
		expect(
			sorted?.children.map((c) =>
				c.type === "workspace" ? c.workspace.id : c.section.id,
			),
		).toEqual(["w-new", "w-old"]);
	});

	it("falls back to name order instead of throwing on garbage timestamps", () => {
		const garbage = makeProject({
			id: "p-garbage",
			name: "Apple",
			createdAt: "not-a-date" as unknown as Date,
		});
		const alsoGarbage = makeProject({
			id: "p-garbage-2",
			name: "Banana",
			createdAt: "also-not-a-date" as unknown as Date,
		});
		expect(
			sortDashboardSidebarProjects([alsoGarbage, garbage], "created").map(
				(p) => p.id,
			),
		).toEqual(["p-garbage", "p-garbage-2"]);
	});
});

describe("sortDashboardSidebarProjectChildren", () => {
	const mainChild: DashboardSidebarProjectChild = {
		type: "workspace",
		workspace: makeWorkspace({
			id: "w-main",
			name: "local",
			type: "main",
			updatedAt: new Date("2026-01-01"),
		}),
	};
	const oldWorktree: DashboardSidebarProjectChild = {
		type: "workspace",
		workspace: makeWorkspace({
			id: "w-old",
			name: "old",
			updatedAt: new Date("2026-02-01"),
			createdAt: new Date("2026-06-01"),
		}),
	};
	const newWorktree: DashboardSidebarProjectChild = {
		type: "workspace",
		workspace: makeWorkspace({
			id: "w-new",
			name: "new",
			updatedAt: new Date("2026-06-01"),
			createdAt: new Date("2026-02-01"),
		}),
	};
	const section: DashboardSidebarProjectChild = {
		type: "section",
		section: makeSection({
			id: "s1",
			name: "Section",
			createdAt: new Date("2026-01-15"),
			workspaces: [
				makeWorkspace({
					id: "w-s-old",
					name: "section-old",
					updatedAt: new Date("2026-03-01"),
				}),
				makeWorkspace({
					id: "w-s-new",
					name: "section-new",
					updatedAt: new Date("2026-04-01"),
				}),
			],
		}),
	};

	const childIds = (children: DashboardSidebarProjectChild[]) =>
		children.map((c) =>
			c.type === "workspace" ? c.workspace.id : c.section.id,
		);

	it("returns children untouched in manual mode", () => {
		const children = [oldWorktree, newWorktree];
		expect(sortDashboardSidebarProjectChildren(children, "manual")).toBe(
			children,
		);
	});

	it("keeps the local main pinned first despite older activity", () => {
		const sorted = sortDashboardSidebarProjectChildren(
			[oldWorktree, newWorktree, mainChild],
			"updated",
		);
		expect(childIds(sorted)).toEqual(["w-main", "w-new", "w-old"]);
	});

	it("sorts workspaces inside sections and ranks sections by activity", () => {
		// Section activity (2026-04-01) beats w-old (02-01), loses to w-new (06-01).
		const sorted = sortDashboardSidebarProjectChildren(
			[section, oldWorktree, newWorktree],
			"updated",
		);
		expect(childIds(sorted)).toEqual(["w-new", "s1", "w-old"]);
		const sortedSection = sorted.find((c) => c.type === "section");
		expect(
			sortedSection?.type === "section"
				? sortedSection.section.workspaces.map((w) => w.id)
				: [],
		).toEqual(["w-s-new", "w-s-old"]);
	});

	it("uses createdAt for workspaces and the section's own createdAt in created mode", () => {
		// By createdAt: w-old (06-01) > w-new (02-01) > section (01-15).
		const sorted = sortDashboardSidebarProjectChildren(
			[section, oldWorktree, newWorktree],
			"created",
		);
		expect(childIds(sorted)).toEqual(["w-old", "w-new", "s1"]);
	});

	it("does not mutate the input children or sections", () => {
		const children = [section, oldWorktree, newWorktree];
		const sectionWorkspaceIds =
			section.type === "section"
				? section.section.workspaces.map((w) => w.id)
				: [];
		sortDashboardSidebarProjectChildren(children, "updated");
		expect(childIds(children)).toEqual(["s1", "w-old", "w-new"]);
		expect(
			section.type === "section"
				? section.section.workspaces.map((w) => w.id)
				: [],
		).toEqual(sectionWorkspaceIds);
	});
});

// updatedAt only moves on metadata writes; agent activity (host terminal-agent
// bindings) is what "Last updated" is actually about, so the newer of the two
// must win at every level.
describe("agent activity in updated mode", () => {
	it("ranks a workspace with newer agent activity above a newer updatedAt", () => {
		const project = makeProject({
			id: "p1",
			name: "Alpha",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-metadata",
						name: "renamed-recently",
						updatedAt: new Date("2026-06-01"),
					}),
				},
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-agent",
						name: "prompted-just-now",
						updatedAt: new Date("2026-02-01"),
						lastAgentActivityAt: new Date("2026-07-01").getTime(),
					}),
				},
			],
		});
		const [sorted] = sortDashboardSidebarProjects([project], "updated");
		expect(
			sorted?.children.map((c) =>
				c.type === "workspace" ? c.workspace.id : c.section.id,
			),
		).toEqual(["w-agent", "w-metadata"]);
	});

	it("bubbles agent activity up to project ordering", () => {
		const staleMetadata = makeProject({
			id: "p-agent",
			name: "AgentBusy",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w1",
						name: "one",
						updatedAt: new Date("2026-01-01"),
						lastAgentActivityAt: new Date("2026-07-01").getTime(),
					}),
				},
			],
		});
		const freshMetadata = makeProject({
			id: "p-idle",
			name: "Idle",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w2",
						name: "two",
						updatedAt: new Date("2026-05-01"),
					}),
				},
			],
		});
		expect(
			sortDashboardSidebarProjects(
				[freshMetadata, staleMetadata],
				"updated",
			).map((p) => p.id),
		).toEqual(["p-agent", "p-idle"]);
	});

	it("bubbles agent activity inside a section up to the section's rank", () => {
		const section: DashboardSidebarProjectChild = {
			type: "section",
			section: makeSection({
				id: "s1",
				name: "Section",
				workspaces: [
					makeWorkspace({
						id: "w-s",
						name: "sectioned",
						updatedAt: new Date("2026-01-01"),
						lastAgentActivityAt: new Date("2026-07-01").getTime(),
					}),
				],
			}),
		};
		const loose: DashboardSidebarProjectChild = {
			type: "workspace",
			workspace: makeWorkspace({
				id: "w-loose",
				name: "loose",
				updatedAt: new Date("2026-05-01"),
			}),
		};
		const sorted = sortDashboardSidebarProjectChildren(
			[loose, section],
			"updated",
		);
		expect(
			sorted.map((c) =>
				c.type === "workspace" ? c.workspace.id : c.section.id,
			),
		).toEqual(["s1", "w-loose"]);
	});

	it("ignores agent activity in created mode", () => {
		const project = makeProject({
			id: "p1",
			name: "Alpha",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-created-late",
						name: "late",
						createdAt: new Date("2026-06-01"),
					}),
				},
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-created-early",
						name: "early",
						createdAt: new Date("2026-02-01"),
						lastAgentActivityAt: new Date("2026-07-01").getTime(),
					}),
				},
			],
		});
		const [sorted] = sortDashboardSidebarProjects([project], "created");
		expect(
			sorted?.children.map((c) =>
				c.type === "workspace" ? c.workspace.id : c.section.id,
			),
		).toEqual(["w-created-late", "w-created-early"]);
	});
});
