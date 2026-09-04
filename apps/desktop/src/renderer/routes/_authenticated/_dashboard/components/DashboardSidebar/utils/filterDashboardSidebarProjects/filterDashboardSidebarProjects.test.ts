import { describe, expect, it } from "bun:test";
import {
	makeProject,
	makeSection,
	makeWorkspace,
} from "../testProjectFixtures";
import { filterDashboardSidebarProjects } from "./filterDashboardSidebarProjects";

const projects = [
	makeProject({
		id: "p-superset",
		name: "Superset",
		isCollapsed: true,
		children: [
			{
				type: "workspace",
				workspace: makeWorkspace({ id: "w1", name: "fix-login" }),
			},
			{
				type: "section",
				section: makeSection({
					id: "s1",
					name: "Backend",
					isCollapsed: true,
					workspaces: [
						makeWorkspace({ id: "w2", name: "api-cleanup" }),
						makeWorkspace({ id: "w3", name: "db-migration" }),
					],
				}),
			},
		],
	}),
	makeProject({
		id: "p-marketing",
		name: "Marketing Site",
		children: [
			{
				type: "workspace",
				workspace: makeWorkspace({
					id: "w4",
					name: "hero-redesign",
					branch: "feat/secret-branch-name",
				}),
			},
		],
	}),
];

describe("filterDashboardSidebarProjects", () => {
	it("returns the same array reference for an empty or whitespace query", () => {
		expect(filterDashboardSidebarProjects(projects, "")).toBe(projects);
		expect(filterDashboardSidebarProjects(projects, "   ")).toBe(projects);
	});

	it("keeps a name-matched project whole but expanded", () => {
		const result = filterDashboardSidebarProjects(projects, "SUPER");
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("p-superset");
		expect(result[0]?.isCollapsed).toBe(false);
		expect(result[0]?.children).toHaveLength(2);
	});

	it("prunes to matching workspaces and expands their project and section", () => {
		const result = filterDashboardSidebarProjects(projects, "api");
		expect(result).toHaveLength(1);
		const project = result[0];
		expect(project?.isCollapsed).toBe(false);
		expect(project?.children).toHaveLength(1);
		const child = project?.children[0];
		if (child?.type !== "section") throw new Error("expected section");
		expect(child.section.isCollapsed).toBe(false);
		expect(child.section.workspaces.map((w) => w.id)).toEqual(["w2"]);
	});

	it("keeps a whole section when the section name matches", () => {
		const result = filterDashboardSidebarProjects(projects, "backend");
		const child = result[0]?.children[0];
		if (child?.type !== "section") throw new Error("expected section");
		expect(child.section.isCollapsed).toBe(false);
		expect(child.section.workspaces).toHaveLength(2);
	});

	it("trims the query before matching", () => {
		expect(
			filterDashboardSidebarProjects(projects, "  hero  ").map((p) => p.id),
		).toEqual(["p-marketing"]);
	});

	it("does not match branch names", () => {
		expect(filterDashboardSidebarProjects(projects, "secret")).toHaveLength(0);
	});

	it("drops projects with no match anywhere", () => {
		expect(filterDashboardSidebarProjects(projects, "hero")).toHaveLength(1);
		expect(filterDashboardSidebarProjects(projects, "zzz")).toHaveLength(0);
	});

	it("keeps object references when nothing changes (memo stability)", () => {
		// p-marketing is already expanded and all its workspaces match, so the
		// original object must pass through untouched.
		const byName = filterDashboardSidebarProjects(projects, "marketing");
		expect(byName[0]).toBe(projects[1]);

		const byWorkspace = filterDashboardSidebarProjects(projects, "hero");
		expect(byWorkspace[0]).toBe(projects[1]);
	});

	it("never mutates the input", () => {
		filterDashboardSidebarProjects(projects, "api");
		expect(projects[0]?.isCollapsed).toBe(true);
		const section = projects[0]?.children[1];
		if (section?.type !== "section") throw new Error("expected section");
		expect(section.section.isCollapsed).toBe(true);
		expect(section.section.workspaces).toHaveLength(2);
	});
});
