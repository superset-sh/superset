import { describe, expect, test } from "bun:test";
import type { EnrichedPort } from "shared/types";
import {
	buildWorkspaceNames,
	buildWorkspacePortGroups,
} from "./buildWorkspacePortGroups";

function makePort(
	overrides: Partial<EnrichedPort> & { port: number; workspaceId: string },
): EnrichedPort {
	return {
		pid: 1000 + overrides.port,
		processName: "node",
		paneId: `pane-${overrides.port}`,
		detectedAt: Date.now(),
		address: "127.0.0.1",
		label: null,
		...overrides,
	};
}

describe("buildWorkspaceNames", () => {
	test("returns empty record when allWorkspaces is undefined", () => {
		expect(buildWorkspaceNames(undefined)).toEqual({});
	});

	test("returns empty record when allWorkspaces is empty", () => {
		expect(buildWorkspaceNames([])).toEqual({});
	});

	test("maps workspace IDs to names", () => {
		const workspaces = [
			{ id: "ws-1", name: "My Workspace" },
			{ id: "ws-2", name: "Another Workspace" },
		];
		expect(buildWorkspaceNames(workspaces)).toEqual({
			"ws-1": "My Workspace",
			"ws-2": "Another Workspace",
		});
	});

	test("reflects renamed workspace immediately when called with updated data", () => {
		const before = [{ id: "ws-1", name: "Old Name" }];
		const after = [{ id: "ws-1", name: "New Name" }];

		const namesBefore = buildWorkspaceNames(before);
		const namesAfter = buildWorkspaceNames(after);

		expect(namesBefore["ws-1"]).toBe("Old Name");
		expect(namesAfter["ws-1"]).toBe("New Name");
	});
});

describe("buildWorkspacePortGroups", () => {
	test("returns empty array when no ports", () => {
		expect(buildWorkspacePortGroups([], {})).toEqual([]);
	});

	test("groups ports by workspaceId", () => {
		const ports = [
			makePort({ port: 3000, workspaceId: "ws-1" }),
			makePort({ port: 3001, workspaceId: "ws-1" }),
			makePort({ port: 4000, workspaceId: "ws-2" }),
		];
		const names = { "ws-1": "Frontend", "ws-2": "Backend" };

		const groups = buildWorkspacePortGroups(ports, names);

		expect(groups).toHaveLength(2);

		const backendGroup = groups.find((g) => g.workspaceId === "ws-2");
		expect(backendGroup?.ports).toHaveLength(1);
		expect(backendGroup?.workspaceName).toBe("Backend");

		const frontendGroup = groups.find((g) => g.workspaceId === "ws-1");
		expect(frontendGroup?.ports).toHaveLength(2);
		expect(frontendGroup?.workspaceName).toBe("Frontend");
	});

	test("uses 'Unknown' for missing workspace names", () => {
		const ports = [makePort({ port: 5000, workspaceId: "ws-unknown" })];

		const groups = buildWorkspacePortGroups(ports, {});
		expect(groups[0].workspaceName).toBe("Unknown");
	});

	test("sorts ports within each group by port number", () => {
		const ports = [
			makePort({ port: 8080, workspaceId: "ws-1" }),
			makePort({ port: 3000, workspaceId: "ws-1" }),
			makePort({ port: 5000, workspaceId: "ws-1" }),
		];
		const names = { "ws-1": "App" };

		const groups = buildWorkspacePortGroups(ports, names);
		const portNumbers = groups[0].ports.map((p) => p.port);
		expect(portNumbers).toEqual([3000, 5000, 8080]);
	});

	test("sorts groups alphabetically by workspace name", () => {
		const ports = [
			makePort({ port: 3000, workspaceId: "ws-z" }),
			makePort({ port: 4000, workspaceId: "ws-a" }),
			makePort({ port: 5000, workspaceId: "ws-m" }),
		];
		const names = { "ws-z": "Zulu", "ws-a": "Alpha", "ws-m": "Mike" };

		const groups = buildWorkspacePortGroups(ports, names);
		expect(groups.map((g) => g.workspaceName)).toEqual([
			"Alpha",
			"Mike",
			"Zulu",
		]);
	});

	test("port groups reflect updated workspace names after rename", () => {
		const ports = [
			makePort({ port: 3000, workspaceId: "ws-1" }),
			makePort({ port: 4000, workspaceId: "ws-2" }),
		];

		// Before rename
		const namesBefore = { "ws-1": "Old Name", "ws-2": "Other" };
		const groupsBefore = buildWorkspacePortGroups(ports, namesBefore);
		const ws1Before = groupsBefore.find((g) => g.workspaceId === "ws-1");
		expect(ws1Before?.workspaceName).toBe("Old Name");

		// After rename — simulates what happens when workspaces.getAll returns fresh data
		const namesAfter = { "ws-1": "Renamed Workspace", "ws-2": "Other" };
		const groupsAfter = buildWorkspacePortGroups(ports, namesAfter);
		const ws1After = groupsAfter.find((g) => g.workspaceId === "ws-1");
		expect(ws1After?.workspaceName).toBe("Renamed Workspace");
	});

	test("re-sorts groups when workspace name changes affect sort order", () => {
		const ports = [
			makePort({ port: 3000, workspaceId: "ws-1" }),
			makePort({ port: 4000, workspaceId: "ws-2" }),
		];

		// ws-1 = "Beta" sorts after ws-2 = "Alpha"
		const namesBefore = { "ws-1": "Beta", "ws-2": "Alpha" };
		const groupsBefore = buildWorkspacePortGroups(ports, namesBefore);
		expect(groupsBefore[0].workspaceName).toBe("Alpha");
		expect(groupsBefore[1].workspaceName).toBe("Beta");

		// After renaming ws-1 to "AAA", it should now sort first
		const namesAfter = { "ws-1": "AAA", "ws-2": "Alpha" };
		const groupsAfter = buildWorkspacePortGroups(ports, namesAfter);
		expect(groupsAfter[0].workspaceName).toBe("AAA");
		expect(groupsAfter[1].workspaceName).toBe("Alpha");
	});
});
