import { describe, expect, it } from "bun:test";
import type { DashboardSidebarProjectChild } from "../../types";
import {
	makeProject,
	makeSection,
	makeWorkspace,
} from "../testProjectFixtures";
import {
	getWorkspaceActivityTime,
	sortDashboardSidebarProjectChildren,
	sortDashboardSidebarProjects,
} from "./sortDashboardSidebarProjects";

const at = (iso: string) => new Date(iso).getTime();

const childIds = (children: DashboardSidebarProjectChild[]) =>
	children.map((c) => (c.type === "workspace" ? c.workspace.id : c.section.id));

describe("getWorkspaceActivityTime", () => {
	it("ranks by lastActivityAt alone once the host has stamped it", () => {
		// A rename bumped updatedAt well past the last agent event; the agent
		// event still wins because housekeeping is not activity.
		const workspace = makeWorkspace({
			id: "w",
			name: "w",
			updatedAt: new Date("2026-08-01"),
			lastActivityAt: at("2026-03-01"),
		});
		expect(getWorkspaceActivityTime(workspace)).toBe(at("2026-03-01"));
	});

	it("falls back to updatedAt for rows from a host that predates the column", () => {
		const workspace = makeWorkspace({
			id: "w",
			name: "w",
			updatedAt: new Date("2026-05-01"),
			lastActivityAt: null,
		});
		expect(getWorkspaceActivityTime(workspace)).toBe(at("2026-05-01"));
	});

	it("treats a NaN lastActivityAt like a missing one", () => {
		const workspace = makeWorkspace({
			id: "w",
			name: "w",
			updatedAt: new Date("2026-05-01"),
			lastActivityAt: Number.NaN,
		});
		expect(getWorkspaceActivityTime(workspace)).toBe(at("2026-05-01"));
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
					lastActivityAt: at("2026-07-01"),
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
					lastActivityAt: at("2026-05-01"),
				}),
			},
		],
	});

	it("returns the input untouched in manual mode", () => {
		const projects = [older, newer];
		expect(sortDashboardSidebarProjects(projects, "manual")).toBe(projects);
	});

	it("keeps the manual project order in created mode", () => {
		expect(
			sortDashboardSidebarProjects([older, newer], "created").map((p) => p.id),
		).toEqual(["p-older", "p-newer"]);
	});

	it("keeps the manual project order in active mode", () => {
		expect(
			sortDashboardSidebarProjects([newer, older], "active").map((p) => p.id),
		).toEqual(["p-newer", "p-older"]);
	});

	it("does not mutate the input array", () => {
		const projects = [newer, older];
		sortDashboardSidebarProjects(projects, "active");
		expect(projects.map((p) => p.id)).toEqual(["p-newer", "p-older"]);
	});

	it("keeps a project's identity when its children are already in order", () => {
		const [sorted] = sortDashboardSidebarProjects([older], "active");
		expect(sorted).toBe(older);
	});

	// Persisted caches can revive Date columns as ISO strings; sorting must
	// coerce them, never throw mid-render.
	it("sorts children whose timestamps are ISO strings at runtime", () => {
		const project = makeProject({
			id: "p1",
			name: "Alpha",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-date",
						name: "host-served",
						updatedAt: new Date("2026-05-01"),
					}),
				},
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-string",
						name: "cached",
						updatedAt: "2026-07-01T00:00:00.000Z" as unknown as Date,
					}),
				},
			],
		});
		const [sorted] = sortDashboardSidebarProjects([project], "active");
		expect(childIds(sorted?.children ?? [])).toEqual(["w-string", "w-date"]);
	});

	it("does not throw for null or undefined timestamps", () => {
		const nullish = makeProject({
			id: "p-null",
			name: "Null",
			createdAt: null as unknown as Date,
			updatedAt: undefined as unknown as Date,
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-null",
						name: "null",
						createdAt: null as unknown as Date,
						updatedAt: undefined as unknown as Date,
						lastActivityAt: null,
					}),
				},
			],
		});
		expect(() =>
			sortDashboardSidebarProjects([nullish], "active"),
		).not.toThrow();
		expect(() =>
			sortDashboardSidebarProjects([nullish], "created"),
		).not.toThrow();
	});
});

describe("sortDashboardSidebarProjectChildren", () => {
	const mainChild: DashboardSidebarProjectChild = {
		type: "workspace",
		workspace: makeWorkspace({
			id: "w-main",
			name: "local",
			type: "main",
			lastActivityAt: at("2026-01-01"),
		}),
	};
	const oldWorktree: DashboardSidebarProjectChild = {
		type: "workspace",
		workspace: makeWorkspace({
			id: "w-old",
			name: "old",
			lastActivityAt: at("2026-02-01"),
			createdAt: new Date("2026-06-01"),
		}),
	};
	const newWorktree: DashboardSidebarProjectChild = {
		type: "workspace",
		workspace: makeWorkspace({
			id: "w-new",
			name: "new",
			lastActivityAt: at("2026-06-01"),
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
					lastActivityAt: at("2026-03-01"),
				}),
				makeWorkspace({
					id: "w-s-new",
					name: "section-new",
					lastActivityAt: at("2026-04-01"),
				}),
			],
		}),
	};

	it("returns children untouched in manual mode", () => {
		const children = [oldWorktree, newWorktree];
		expect(sortDashboardSidebarProjectChildren(children, "manual")).toBe(
			children,
		);
	});

	it("keeps the local main pinned first despite older activity", () => {
		const sorted = sortDashboardSidebarProjectChildren(
			[oldWorktree, newWorktree, mainChild],
			"active",
		);
		expect(childIds(sorted)).toEqual(["w-main", "w-new", "w-old"]);
	});

	it("does not pin a remote host's main workspace", () => {
		const remoteMain: DashboardSidebarProjectChild = {
			type: "workspace",
			workspace: makeWorkspace({
				id: "w-remote-main",
				name: "remote",
				type: "main",
				hostType: "remote-device",
				lastActivityAt: at("2026-01-01"),
			}),
		};
		const sorted = sortDashboardSidebarProjectChildren(
			[remoteMain, newWorktree],
			"active",
		);
		expect(childIds(sorted)).toEqual(["w-new", "w-remote-main"]);
	});

	it("sorts workspaces inside sections and ranks sections by newest member", () => {
		// Section activity (2026-04-01) beats w-old (02-01), loses to w-new (06-01).
		const sorted = sortDashboardSidebarProjectChildren(
			[section, oldWorktree, newWorktree],
			"active",
		);
		expect(childIds(sorted)).toEqual(["w-new", "s1", "w-old"]);
		const sortedSection = sorted.find((c) => c.type === "section");
		expect(
			sortedSection?.type === "section"
				? sortedSection.section.workspaces.map((w) => w.id)
				: [],
		).toEqual(["w-s-new", "w-s-old"]);
	});

	it("ranks an empty section by its own createdAt in active mode", () => {
		const empty: DashboardSidebarProjectChild = {
			type: "section",
			section: makeSection({
				id: "s-empty",
				name: "Empty",
				createdAt: new Date("2026-03-01"),
			}),
		};
		const sorted = sortDashboardSidebarProjectChildren(
			[oldWorktree, empty, newWorktree],
			"active",
		);
		expect(childIds(sorted)).toEqual(["w-new", "s-empty", "w-old"]);
	});

	it("uses createdAt for workspaces and the section's own createdAt in created mode", () => {
		// By createdAt: w-old (06-01) > w-new (02-01) > section (01-15).
		const sorted = sortDashboardSidebarProjectChildren(
			[section, oldWorktree, newWorktree],
			"created",
		);
		expect(childIds(sorted)).toEqual(["w-old", "w-new", "s1"]);
	});

	it("ignores lastActivityAt in created mode", () => {
		const createdLate: DashboardSidebarProjectChild = {
			type: "workspace",
			workspace: makeWorkspace({
				id: "w-created-late",
				name: "late",
				createdAt: new Date("2026-06-01"),
			}),
		};
		const createdEarlyButActive: DashboardSidebarProjectChild = {
			type: "workspace",
			workspace: makeWorkspace({
				id: "w-created-early",
				name: "early",
				createdAt: new Date("2026-02-01"),
				lastActivityAt: at("2026-07-01"),
			}),
		};
		const sorted = sortDashboardSidebarProjectChildren(
			[createdEarlyButActive, createdLate],
			"created",
		);
		expect(childIds(sorted)).toEqual(["w-created-late", "w-created-early"]);
	});

	it("breaks timestamp ties by name, then id", () => {
		const tie = at("2026-05-01");
		const apple = makeWorkspace({
			id: "w-a",
			name: "Apple",
			lastActivityAt: tie,
		});
		const banana = makeWorkspace({
			id: "w-b",
			name: "Banana",
			lastActivityAt: tie,
		});
		const banana2 = makeWorkspace({
			id: "w-b2",
			name: "Banana",
			lastActivityAt: tie,
		});
		const sorted = sortDashboardSidebarProjectChildren(
			[banana2, banana, apple].map((workspace) => ({
				type: "workspace" as const,
				workspace,
			})),
			"active",
		);
		expect(childIds(sorted)).toEqual(["w-a", "w-b", "w-b2"]);
	});

	it("sinks garbage timestamps below dated rows and orders them by name", () => {
		const dated: DashboardSidebarProjectChild = {
			type: "workspace",
			workspace: makeWorkspace({
				id: "w-dated",
				name: "Zed",
				createdAt: new Date("2020-01-01"),
			}),
		};
		const garbage: DashboardSidebarProjectChild = {
			type: "workspace",
			workspace: makeWorkspace({
				id: "w-garbage",
				name: "Apple",
				createdAt: "not-a-date" as unknown as Date,
			}),
		};
		const alsoGarbage: DashboardSidebarProjectChild = {
			type: "workspace",
			workspace: makeWorkspace({
				id: "w-garbage-2",
				name: "Banana",
				createdAt: "also-not-a-date" as unknown as Date,
			}),
		};
		expect(
			childIds(
				sortDashboardSidebarProjectChildren(
					[alsoGarbage, dated, garbage],
					"created",
				),
			),
		).toEqual(["w-dated", "w-garbage", "w-garbage-2"]);
	});

	it("does not mutate the input children or sections", () => {
		const children = [section, oldWorktree, newWorktree];
		const sectionWorkspaceIds = section.section.workspaces.map((w) => w.id);
		sortDashboardSidebarProjectChildren(children, "active");
		expect(childIds(children)).toEqual(["s1", "w-old", "w-new"]);
		expect(section.section.workspaces.map((w) => w.id)).toEqual(
			sectionWorkspaceIds,
		);
	});

	it("keeps array and section identity when already in order", () => {
		const orderedSection: DashboardSidebarProjectChild = {
			type: "section",
			section: makeSection({
				id: "s-ordered",
				name: "Ordered",
				workspaces: [
					makeWorkspace({
						id: "w-a",
						name: "a",
						lastActivityAt: at("2026-05-01"),
					}),
					makeWorkspace({
						id: "w-b",
						name: "b",
						lastActivityAt: at("2026-04-01"),
					}),
				],
			}),
		};
		const children = [mainChild, newWorktree, orderedSection, oldWorktree];
		const sorted = sortDashboardSidebarProjectChildren(children, "active");
		expect(sorted).toBe(children);
		expect(sorted[2]).toBe(orderedSection);
	});
});

// The whole point of the rework: the host's lastActivityAt is the signal,
// and metadata writes never masquerade as activity.
describe("lastActivityAt in active mode", () => {
	it("ranks a freshly prompted workspace above one that was merely renamed", () => {
		const project = makeProject({
			id: "p1",
			name: "Alpha",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-renamed",
						name: "renamed-just-now",
						updatedAt: new Date("2026-08-01"),
						lastActivityAt: at("2026-02-01"),
					}),
				},
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-prompted",
						name: "prompted-recently",
						updatedAt: new Date("2026-01-01"),
						lastActivityAt: at("2026-07-01"),
					}),
				},
			],
		});
		const [sorted] = sortDashboardSidebarProjects([project], "active");
		expect(childIds(sorted?.children ?? [])).toEqual([
			"w-prompted",
			"w-renamed",
		]);
	});

	it("ranks an old-host workspace (null lastActivityAt) by its updatedAt", () => {
		const project = makeProject({
			id: "p1",
			name: "Alpha",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-old-host",
						name: "old-host",
						updatedAt: new Date("2026-06-01"),
						lastActivityAt: null,
					}),
				},
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-new-host",
						name: "new-host",
						updatedAt: new Date("2026-08-01"),
						lastActivityAt: at("2026-05-01"),
					}),
				},
			],
		});
		const [sorted] = sortDashboardSidebarProjects([project], "active");
		expect(childIds(sorted?.children ?? [])).toEqual([
			"w-old-host",
			"w-new-host",
		]);
	});

	// Activity ranks rows inside a project and stops there — a busy workspace
	// must not drag its project up past the one above it.
	it("does not bubble activity up to project ordering", () => {
		const idle = makeProject({
			id: "p-idle",
			name: "Idle",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w2",
						name: "two",
						lastActivityAt: at("2026-05-01"),
					}),
				},
			],
		});
		const busy = makeProject({
			id: "p-busy",
			name: "Busy",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w1",
						name: "one",
						lastActivityAt: at("2026-07-01"),
					}),
				},
			],
		});
		expect(
			sortDashboardSidebarProjects([idle, busy], "active").map((p) => p.id),
		).toEqual(["p-idle", "p-busy"]);
	});

	it("bubbles activity inside a section up to the section's rank", () => {
		const section: DashboardSidebarProjectChild = {
			type: "section",
			section: makeSection({
				id: "s1",
				name: "Section",
				workspaces: [
					makeWorkspace({
						id: "w-s",
						name: "sectioned",
						lastActivityAt: at("2026-07-01"),
					}),
				],
			}),
		};
		const loose: DashboardSidebarProjectChild = {
			type: "workspace",
			workspace: makeWorkspace({
				id: "w-loose",
				name: "loose",
				lastActivityAt: at("2026-05-01"),
			}),
		};
		const sorted = sortDashboardSidebarProjectChildren(
			[loose, section],
			"active",
		);
		expect(childIds(sorted)).toEqual(["s1", "w-loose"]);
	});
});
