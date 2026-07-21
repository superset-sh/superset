import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	executeSidebarCommand,
	initializeSidebarState,
	readSidebarState,
	replaceSidebarState,
	sidebarStatePath,
} from "./store";

const temporaryDirectories: string[] = [];
const scope = { organizationId: "organization-1", userId: "user-1" };

async function makeHome(): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "superset-client-state-"));
	temporaryDirectories.push(home);
	return home;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
	);
});

describe("client sidebar state store", () => {
	test("initializes once and scopes state by organization and user", async () => {
		const home = await makeHome();
		const initial = await readSidebarState(home, scope);
		expect(initial.initialized).toBe(false);

		const initialized = await initializeSidebarState(home, scope, {
			projects: [{ id: "project-1", tabOrder: 1, isCollapsed: false }],
			groups: [],
			workspaces: [],
		});
		expect(initialized.document.revision).toBe(1);
		expect(initialized.document.rendererMigrated).toBe(true);

		await initializeSidebarState(home, scope, {
			projects: [{ id: "ignored", tabOrder: 1, isCollapsed: false }],
			groups: [],
			workspaces: [],
		});
		expect(
			(await readSidebarState(home, scope)).document.state.projects[0]?.id,
		).toBe("project-1");
		expect(
			(await readSidebarState(home, { ...scope, userId: "user-2" }))
				.initialized,
		).toBe(false);
	});

	test("merges renderer localStorage after a headless CLI-first write", async () => {
		const home = await makeHome();
		await executeSidebarCommand(home, scope, {
			action: "create-group",
			groupId: "cli-group",
			projectId: "project-1",
			name: "From CLI",
		});
		const pending = await readSidebarState(home, scope);
		expect(pending.document.rendererMigrated).toBe(false);

		const migrated = await initializeSidebarState(home, scope, {
			projects: [{ id: "legacy-project", tabOrder: 1, isCollapsed: true }],
			groups: [
				{
					id: "legacy-group",
					projectId: "legacy-project",
					name: "From renderer",
					tabOrder: 1,
					isCollapsed: false,
					color: null,
				},
			],
			workspaces: [],
		});
		expect(migrated.document.rendererMigrated).toBe(true);
		expect(
			migrated.document.state.groups.map((group) => group.id).sort(),
		).toEqual(["cli-group", "legacy-group"]);
	});

	test("serializes command updates and rejects stale replacements", async () => {
		const home = await makeHome();
		await Promise.all([
			executeSidebarCommand(home, scope, {
				action: "create-group",
				groupId: "group-1",
				projectId: "project-1",
				name: "One",
			}),
			executeSidebarCommand(home, scope, {
				action: "create-group",
				groupId: "group-2",
				projectId: "project-1",
				name: "Two",
			}),
		]);
		const current = await readSidebarState(home, scope);
		expect(current.document.state.groups).toHaveLength(2);

		const stale = await replaceSidebarState(
			home,
			scope,
			{ projects: [], groups: [], workspaces: [] },
			{ expectedRevision: current.document.revision - 1 },
		);
		expect(stale.conflict).toBe(true);
		expect(stale.document.state.groups).toHaveLength(2);
	});

	test("writes a versioned private document atomically", async () => {
		const home = await makeHome();
		await executeSidebarCommand(home, scope, {
			action: "create-group",
			groupId: "group-1",
			projectId: "project-1",
			name: "Review",
		});
		const raw = JSON.parse(
			await readFile(sidebarStatePath(home, scope), "utf8"),
		);
		expect(raw).toMatchObject({
			version: 1,
			revision: 1,
			rendererMigrated: false,
		});
	});
});
