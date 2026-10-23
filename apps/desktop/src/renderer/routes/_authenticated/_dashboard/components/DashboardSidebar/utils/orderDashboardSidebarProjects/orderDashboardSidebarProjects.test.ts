import { describe, expect, it } from "bun:test";
import type { DashboardSidebarProject } from "../../types";
import { makeProject } from "../testProjectFixtures";
import {
	createProjectNameCollator,
	orderDashboardSidebarProjects,
} from "./orderDashboardSidebarProjects";

const collator = createProjectNameCollator("en");

const projectsNamed = (...names: string[]) =>
	names.map((name) => makeProject({ id: `p-${name}`, name }));

const names = (projects: DashboardSidebarProject[]) =>
	projects.map((project) => project.name);

describe("orderDashboardSidebarProjects", () => {
	it("returns the input untouched in manual order", () => {
		const projects = projectsNamed("beta", "alpha");
		expect(orderDashboardSidebarProjects(projects, "manual", collator)).toBe(
			projects,
		);
	});

	it("orders A–Z ignoring case", () => {
		const projects = projectsNamed("banana", "Apple", "cherry");
		expect(
			names(orderDashboardSidebarProjects(projects, "nameAsc", collator)),
		).toEqual(["Apple", "banana", "cherry"]);
	});

	it("orders Z–A", () => {
		const projects = projectsNamed("banana", "Apple", "cherry");
		expect(
			names(orderDashboardSidebarProjects(projects, "nameDesc", collator)),
		).toEqual(["cherry", "banana", "Apple"]);
	});

	it("compares digits as numbers", () => {
		const projects = projectsNamed("p10", "p2", "p1");
		expect(
			names(orderDashboardSidebarProjects(projects, "nameAsc", collator)),
		).toEqual(["p1", "p2", "p10"]);
	});

	it("breaks name ties by id", () => {
		const projects = [
			makeProject({ id: "p-b", name: "Same" }),
			makeProject({ id: "p-a", name: "same" }),
		];
		expect(
			orderDashboardSidebarProjects(projects, "nameDesc", collator).map(
				(project) => project.id,
			),
		).toEqual(["p-a", "p-b"]);
	});

	// Cached rows can arrive without a name at runtime despite the type.
	it("sorts a project with a missing name first instead of throwing", () => {
		const unnamed = makeProject({
			id: "p-unnamed",
			name: undefined as unknown as string,
		});
		const [first] = orderDashboardSidebarProjects(
			[...projectsNamed("alpha"), unnamed],
			"nameAsc",
			collator,
		);
		expect(first).toBe(unnamed);
	});

	it("keeps the input identity when already in order", () => {
		const projects = projectsNamed("alpha", "beta");
		expect(orderDashboardSidebarProjects(projects, "nameAsc", collator)).toBe(
			projects,
		);
	});

	it("does not mutate the input array", () => {
		const projects = projectsNamed("beta", "alpha");
		orderDashboardSidebarProjects(projects, "nameAsc", collator);
		expect(names(projects)).toEqual(["beta", "alpha"]);
	});
});
