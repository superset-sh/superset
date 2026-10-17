import { describe, expect, test } from "bun:test";
import type { HostProjectItem } from "@/hooks/useHostProjects";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import {
	buildProjectSections,
	NO_PROJECT_SECTION_ID,
} from "./buildProjectSections";

function workspace(
	id: string,
	projectId: string | null,
	ts: number,
	hostId = "mac",
): HostWorkspaceItem {
	return { id, projectId, ts, hostId } as unknown as HostWorkspaceItem;
}

function project(id: string, name: string): HostProjectItem {
	return { id, name, iconUrl: null, repoOwner: null, repoName: null };
}

const activityTs = (item: HostWorkspaceItem) =>
	(item as unknown as { ts: number }).ts;
const byActivity = (a: HostWorkspaceItem, b: HostWorkspaceItem) =>
	activityTs(b) - activityTs(a);

function build(
	workspaces: HostWorkspaceItem[],
	projectsByHost: Record<string, HostProjectItem[]>,
) {
	return buildProjectSections({
		workspaces,
		projectsByHost,
		noProjectName: "No project",
		compareWorkspaces: byActivity,
		activityTs,
	});
}

describe("buildProjectSections", () => {
	test("puts the project with the latest activity first", () => {
		const sections = build(
			[
				workspace("a1", "a", 1),
				workspace("b1", "b", 5),
				workspace("a2", "a", 3),
			],
			{ mac: [project("a", "Alpha"), project("b", "Beta")] },
		);
		expect(sections.map((section) => section.projectId)).toEqual(["b", "a"]);
		expect(sections[1]?.workspaces.map((row) => row.id)).toEqual(["a2", "a1"]);
	});

	test("makes a project two hosts both report one section", () => {
		const sections = build(
			[workspace("mac", "a", 2), workspace("linux", "a", 1, "linux")],
			{ mac: [project("a", "Alpha")], linux: [project("a", "Alpha")] },
		);
		expect(sections).toHaveLength(1);
		expect(sections[0]?.workspaces.map((row) => row.id)).toEqual([
			"mac",
			"linux",
		]);
	});

	test("drops projects with no workspaces", () => {
		const sections = build([workspace("a1", "a", 1)], {
			mac: [project("a", "Alpha"), project("b", "Beta")],
		});
		expect(sections.map((section) => section.projectId)).toEqual(["a"]);
	});

	test("files a workspace under No project when only another host reports its project", () => {
		const sections = build(
			[workspace("mac", "a", 2), workspace("linux", "a", 1, "linux")],
			{ mac: [project("a", "Alpha")], linux: [] },
		);
		expect(sections.map((section) => section.projectId)).toEqual([
			"a",
			NO_PROJECT_SECTION_ID,
		]);
		expect(sections[1]?.workspaces.map((row) => row.id)).toEqual(["linux"]);
	});

	test("files unknown and missing project ids under No project", () => {
		const sections = build(
			[workspace("x1", "gone", 2), workspace("x2", null, 1)],
			{ mac: [project("a", "Alpha")] },
		);
		expect(sections).toHaveLength(1);
		expect(sections[0]?.projectId).toBe(NO_PROJECT_SECTION_ID);
		expect(sections[0]?.name).toBe("No project");
		expect(sections[0]?.workspaces.map((row) => row.id)).toEqual(["x1", "x2"]);
	});

	test("ranks a project by its newest workspace, not a pinned older one", () => {
		const pinnedFirst = (a: HostWorkspaceItem, b: HostWorkspaceItem) =>
			a.id === "pinned" ? -1 : b.id === "pinned" ? 1 : byActivity(a, b);
		const sections = buildProjectSections({
			workspaces: [
				workspace("pinned", "a", 1),
				workspace("fresh", "a", 100),
				workspace("b1", "b", 50),
			],
			projectsByHost: { mac: [project("a", "Alpha"), project("b", "Beta")] },
			noProjectName: "No project",
			compareWorkspaces: pinnedFirst,
			activityTs,
		});
		expect(sections.map((section) => section.projectId)).toEqual(["a", "b"]);
		expect(sections[0]?.workspaces.map((row) => row.id)).toEqual([
			"pinned",
			"fresh",
		]);
	});

	test("breaks activity ties by name", () => {
		const sections = build([workspace("b1", "b", 1), workspace("a1", "a", 1)], {
			mac: [project("b", "Beta"), project("a", "Alpha")],
		});
		expect(sections.map((section) => section.name)).toEqual(["Alpha", "Beta"]);
	});
});
