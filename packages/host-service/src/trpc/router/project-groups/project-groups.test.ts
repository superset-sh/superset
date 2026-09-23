import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import {
	projectGroupMembers,
	projectGroups,
	projects,
} from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { projectGroupsRouter } from "./project-groups";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createHarness() {
	const sqlite = new Database(":memory:");
	sqlite.run("PRAGMA foreign_keys = OFF");
	const rawDb = drizzle(sqlite, { schema });
	migrate(rawDb, { migrationsFolder: MIGRATIONS_FOLDER });
	sqlite.run("PRAGMA foreign_keys = ON");
	const db = rawDb as unknown as HostDb;
	const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
	return { db, caller: createCallerFactory(projectGroupsRouter)(ctx) };
}

function insertProject(db: HostDb, repoPath: string): string {
	const id = randomUUID();
	db.insert(projects)
		.values({ id, repoPath, name: repoPath, updatedAt: 1 })
		.run();
	return id;
}

describe("projectGroups router", () => {
	it("lets the same project belong to any number of groups", async () => {
		const h = createHarness();
		const projectId = insertProject(h.db, "/home/me/code/api");
		const first = await h.caller.create({ name: "Platform" });
		const second = await h.caller.create({ name: "Billing" });

		await h.caller.addMember({ groupId: first.group.id, projectId });
		await h.caller.addMember({ groupId: second.group.id, projectId });

		const { groups } = await h.caller.list();
		expect(
			groups.map((group) => group.members.map((m) => m.projectId)),
		).toEqual([[projectId], [projectId]]);
	});

	it("rejects the same project twice inside one group", async () => {
		const h = createHarness();
		const projectId = insertProject(h.db, "/home/me/code/api");
		const { group } = await h.caller.create({ name: "Platform" });
		await h.caller.addMember({ groupId: group.id, projectId });

		await expect(
			h.caller.addMember({ groupId: group.id, projectId }),
		).rejects.toThrow("already a member");
	});

	it("blocks deleting a project a member still references", async () => {
		const h = createHarness();
		const projectId = insertProject(h.db, "/home/me/code/api");
		const { group } = await h.caller.create({ name: "Platform" });
		const added = await h.caller.addMember({ groupId: group.id, projectId });

		expect(() =>
			h.db.delete(projects).where(eq(projects.id, projectId)).run(),
		).toThrow(/FOREIGN KEY/i);

		await h.caller.removeMember({
			groupId: group.id,
			memberId: added.group.members[0]?.id ?? "",
		});
		h.db.delete(projects).where(eq(projects.id, projectId)).run();
		expect(h.db.select().from(projects).all()).toHaveLength(0);
	});

	it("defaults the folder to the repo directory and deduplicates it", async () => {
		const h = createHarness();
		const { group } = await h.caller.create({ name: "Platform" });
		const first = insertProject(h.db, "/home/me/code/api");
		const second = insertProject(h.db, "/home/me/other/api");
		const third = insertProject(h.db, "/home/me/code/web");

		await h.caller.addMember({ groupId: group.id, projectId: first });
		await h.caller.addMember({ groupId: group.id, projectId: second });
		const after = await h.caller.addMember({
			groupId: group.id,
			projectId: third,
			folder: "API",
		});

		expect(after.group.members.map((member) => member.folder)).toEqual([
			"api",
			"api-2",
			"API-3",
		]);
	});

	it("rejects a folder that is not one path segment", async () => {
		const h = createHarness();
		const { group } = await h.caller.create({ name: "Platform" });
		const projectId = insertProject(h.db, "/home/me/code/api");

		await expect(
			h.caller.addMember({ groupId: group.id, projectId, folder: "../etc" }),
		).rejects.toThrow("single directory name");
	});

	it("promotes a member to position 0 and keeps the rest in order", async () => {
		const h = createHarness();
		const { group } = await h.caller.create({ name: "Platform" });
		for (const repo of ["api", "web", "docs"]) {
			await h.caller.addMember({
				groupId: group.id,
				projectId: insertProject(h.db, `/home/me/code/${repo}`),
			});
		}
		const before = await h.caller.get({ groupId: group.id });
		const docs = before.group.members[2];

		const after = await h.caller.setPrimary({
			groupId: group.id,
			memberId: docs?.id ?? "",
		});

		expect(
			after.group.members.map((member) => [member.position, member.folder]),
		).toEqual([
			[0, "docs"],
			[1, "api"],
			[2, "web"],
		]);
	});

	it("refuses to remove the primary while other members remain", async () => {
		const h = createHarness();
		const { group } = await h.caller.create({ name: "Platform" });
		await h.caller.addMember({
			groupId: group.id,
			projectId: insertProject(h.db, "/home/me/code/api"),
		});
		const filled = await h.caller.addMember({
			groupId: group.id,
			projectId: insertProject(h.db, "/home/me/code/web"),
		});
		const primary = filled.group.members[0];

		await expect(
			h.caller.removeMember({
				groupId: group.id,
				memberId: primary?.id ?? "",
			}),
		).rejects.toThrow("make another member primary first");

		const promoted = await h.caller.setPrimary({
			groupId: group.id,
			memberId: filled.group.members[1]?.id ?? "",
		});
		const removed = await h.caller.removeMember({
			groupId: group.id,
			memberId: primary?.id ?? "",
		});
		expect(promoted.group.members[0]?.folder).toBe("web");
		expect(removed.group.members.map((member) => member.folder)).toEqual([
			"web",
		]);
	});

	it("removes the last member without promotion", async () => {
		const h = createHarness();
		const { group } = await h.caller.create({ name: "Platform" });
		const added = await h.caller.addMember({
			groupId: group.id,
			projectId: insertProject(h.db, "/home/me/code/api"),
		});

		const after = await h.caller.removeMember({
			groupId: group.id,
			memberId: added.group.members[0]?.id ?? "",
		});

		expect(after.group.members).toEqual([]);
	});

	it("renames a group and reports it back", async () => {
		const h = createHarness();
		const { group } = await h.caller.create({ name: " Platform " });
		expect(group.name).toBe("Platform");

		const renamed = await h.caller.rename({
			groupId: group.id,
			name: "Infrastructure",
		});

		expect(renamed.group.name).toBe("Infrastructure");
		expect((await h.caller.get({ groupId: group.id })).group.name).toBe(
			"Infrastructure",
		);
	});

	it("deletes the group and its members, never a project", async () => {
		const h = createHarness();
		const projectId = insertProject(h.db, "/home/me/code/api");
		const { group } = await h.caller.create({ name: "Platform" });
		await h.caller.addMember({ groupId: group.id, projectId });

		await h.caller.remove({ groupId: group.id });

		expect(h.db.select().from(projectGroups).all()).toHaveLength(0);
		expect(h.db.select().from(projectGroupMembers).all()).toHaveLength(0);
		expect(h.db.select().from(projects).all()).toHaveLength(1);
		await expect(h.caller.get({ groupId: group.id })).rejects.toThrow(
			"Project group not found",
		);
	});

	it("rejects a member whose project is not on this host", async () => {
		const h = createHarness();
		const { group } = await h.caller.create({ name: "Platform" });

		await expect(
			h.caller.addMember({ groupId: group.id, projectId: randomUUID() }),
		).rejects.toThrow("not set up on this host");
	});
});
