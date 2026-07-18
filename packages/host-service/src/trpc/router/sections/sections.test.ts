import { Database } from "bun:sqlite";
import { describe, expect, it, mock } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { sectionsRouter } from "./sections";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const WS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WS_OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";

function createHarness() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

	db.insert(schema.projects)
		.values([
			{ id: PROJECT_ID, repoPath: "/tmp/project" },
			{ id: OTHER_PROJECT_ID, repoPath: "/tmp/other" },
		])
		.run();
	db.insert(schema.workspaces)
		.values([
			{
				id: WS_A,
				projectId: PROJECT_ID,
				worktreePath: "/tmp/project/a",
				branch: "a",
				name: "A",
				tabOrder: 1,
				createdAt: 1,
				updatedAt: 1,
			},
			{
				id: WS_B,
				projectId: PROJECT_ID,
				worktreePath: "/tmp/project/b",
				branch: "b",
				name: "B",
				tabOrder: 2,
				createdAt: 1,
				updatedAt: 1,
			},
			{
				id: WS_OTHER,
				projectId: OTHER_PROJECT_ID,
				worktreePath: "/tmp/other/c",
				branch: "c",
				name: "C",
				tabOrder: 1,
				createdAt: 1,
				updatedAt: 1,
			},
		])
		.run();

	const broadcastSectionChanged = mock((_message: unknown) => {});
	const broadcastWorkspaceChanged = mock((_message: unknown) => {});
	const ctx = {
		db,
		isAuthenticated: true,
		eventBus: { broadcastSectionChanged, broadcastWorkspaceChanged },
	} as unknown as HostServiceContext;
	return {
		db,
		caller: sectionsRouter.createCaller(ctx),
		broadcastSectionChanged,
		broadcastWorkspaceChanged,
	};
}

describe("sectionsRouter", () => {
	it("creates a section appended to the project's top-level lane and broadcasts", async () => {
		const { caller, broadcastSectionChanged } = createHarness();

		const section = await caller.create({
			projectId: PROJECT_ID,
			name: "Bugs",
		});

		// Lane holds two ungrouped workspaces (tabOrder 1, 2) → append = 3.
		expect(section.tabOrder).toBe(3);
		expect(section.color).toBeNull();
		expect(broadcastSectionChanged).toHaveBeenCalledTimes(1);
		const message = broadcastSectionChanged.mock.calls[0]?.[0] as {
			eventType: string;
			sections: Array<{ id: string }>;
		};
		expect(message.eventType).toBe("created");
		expect(message.sections.map((row) => row.id)).toEqual([section.id]);
	});

	it("is idempotent on client-supplied ids", async () => {
		const { caller } = createHarness();
		const first = await caller.create({
			id: MISSING_ID,
			projectId: PROJECT_ID,
			name: "Bugs",
		});
		const second = await caller.create({
			id: MISSING_ID,
			projectId: PROJECT_ID,
			name: "Renamed elsewhere",
		});
		expect(second).toEqual(first);
	});

	it("rejects creating for an unknown project", async () => {
		const { caller } = createHarness();
		await expect(
			caller.create({ projectId: MISSING_ID, name: "Bugs" }),
		).rejects.toThrow("Project not found");
	});

	it("updates name and color; 404s on a missing section", async () => {
		const { caller } = createHarness();
		const section = await caller.create({
			projectId: PROJECT_ID,
			name: "Bugs",
		});

		const renamed = await caller.update({ id: section.id, name: "Fixes" });
		expect(renamed.name).toBe("Fixes");
		const colored = await caller.update({ id: section.id, color: "#ff0000" });
		expect(colored.color).toBe("#ff0000");

		await expect(caller.update({ id: MISSING_ID, name: "x" })).rejects.toThrow(
			"not found",
		);
	});

	it("moveWorkspace appends within the section and clears on ungroup", async () => {
		const { caller } = createHarness();
		const section = await caller.create({
			projectId: PROJECT_ID,
			name: "Bugs",
		});

		const moved = await caller.moveWorkspace({
			workspaceId: WS_A,
			sectionId: section.id,
		});
		expect(moved.sectionId).toBe(section.id);
		expect(moved.tabOrder).toBe(1);

		const second = await caller.moveWorkspace({
			workspaceId: WS_B,
			sectionId: section.id,
		});
		expect(second.tabOrder).toBe(2);

		const ungrouped = await caller.moveWorkspace({
			workspaceId: WS_A,
			sectionId: null,
		});
		expect(ungrouped.sectionId).toBeNull();
	});

	it("moveWorkspace honors an explicit absolute tabOrder", async () => {
		const { caller } = createHarness();
		const section = await caller.create({
			projectId: PROJECT_ID,
			name: "Bugs",
		});
		const moved = await caller.moveWorkspace({
			workspaceId: WS_A,
			sectionId: section.id,
			tabOrder: 42,
		});
		expect(moved.tabOrder).toBe(42);
	});

	it("rejects moving a workspace into a section from another project", async () => {
		const { caller } = createHarness();
		const section = await caller.create({
			projectId: PROJECT_ID,
			name: "Bugs",
		});
		await expect(
			caller.moveWorkspace({ workspaceId: WS_OTHER, sectionId: section.id }),
		).rejects.toThrow("different project");
	});

	it("allows referencing a section this host doesn't know (cross-host groups)", async () => {
		const { caller } = createHarness();
		const moved = await caller.moveWorkspace({
			workspaceId: WS_A,
			sectionId: MISSING_ID,
			tabOrder: 1,
		});
		expect(moved.sectionId).toBe(MISSING_ID);
	});

	it("delete un-groups members instead of deleting them and broadcasts per member", async () => {
		const { caller, broadcastWorkspaceChanged } = createHarness();
		const section = await caller.create({
			projectId: PROJECT_ID,
			name: "Bugs",
		});
		await caller.moveWorkspace({ workspaceId: WS_A, sectionId: section.id });
		broadcastWorkspaceChanged.mockClear();

		await caller.delete({ id: section.id });

		const sections = await caller.list();
		expect(sections).toHaveLength(0);
		const rows = broadcastWorkspaceChanged.mock.calls.map(
			(call) =>
				(call[0] as { workspace: { id: string; sectionId: string | null } })
					.workspace,
		);
		const memberRow = rows.find((row) => row.id === WS_A);
		expect(memberRow?.sectionId).toBeNull();

		await expect(caller.delete({ id: section.id })).rejects.toThrow(
			"not found",
		);
	});

	it("reorder applies absolute tabOrders", async () => {
		const { caller } = createHarness();
		const first = await caller.create({ projectId: PROJECT_ID, name: "One" });
		const second = await caller.create({ projectId: PROJECT_ID, name: "Two" });

		await caller.reorder({
			items: [
				{ id: first.id, tabOrder: 20 },
				{ id: second.id, tabOrder: 10 },
			],
		});

		const sections = await caller.list({ projectId: PROJECT_ID });
		expect(sections.map((row) => row.id)).toEqual([second.id, first.id]);
	});

	it("reorderInSection rewrites member order", async () => {
		const { caller, db } = createHarness();
		const section = await caller.create({
			projectId: PROJECT_ID,
			name: "Bugs",
		});
		await caller.moveWorkspace({ workspaceId: WS_A, sectionId: section.id });
		await caller.moveWorkspace({ workspaceId: WS_B, sectionId: section.id });

		await caller.reorderInSection({
			sectionId: section.id,
			workspaceIds: [WS_B, WS_A],
		});

		const rows = db
			.select({
				id: schema.workspaces.id,
				tabOrder: schema.workspaces.tabOrder,
			})
			.from(schema.workspaces)
			.all()
			.filter((row) => row.id === WS_A || row.id === WS_B)
			.sort((left, right) => left.tabOrder - right.tabOrder);
		expect(rows.map((row) => row.id)).toEqual([WS_B, WS_A]);
	});
});
