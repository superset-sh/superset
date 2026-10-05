import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
	PROJECTS_TAG_SCOPE,
	visibleWorkspaceTags,
	WORKSPACE_TAG_MAX_LENGTH,
	WORKSPACE_TAGS_MAX_PER_WORKSPACE,
} from "@superset/shared/workspace-tags";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { projects, projectTags } from "../db/schema";
import type { EventBus } from "../events";
import type { ProjectChangedMessage } from "../events/types";
import { getTagFolderSettings } from "../tag-folders";
import { createCallerFactory } from "../trpc";
import { projectRouter } from "../trpc/router/project/project";
import { tagFoldersRouter } from "../trpc/router/tag-folders/tag-folders";
import type { HostServiceContext } from "../types";
import { purgeDeletedProject } from "./project-deletion";
import { getProjectTagAssignments } from "./project-tags";

const PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const connections: Database[] = [];
afterEach(() => {
	for (const connection of connections.splice(0)) connection.close();
});

function setup() {
	const sqlite = new Database(":memory:");
	connections.push(sqlite);
	sqlite.run("PRAGMA foreign_keys = ON");
	const rawDb = drizzle(sqlite, { schema });
	migrate(rawDb, {
		migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
	});
	const db = rawDb as unknown as HostDb;
	db.insert(projects)
		.values({ id: PROJECT, name: "demo", repoPath: "/repo/demo" })
		.run();
	const messages: ProjectChangedMessage[] = [];
	const eventBus = {
		broadcastProjectChanged(message: Omit<ProjectChangedMessage, "type">) {
			messages.push({ type: "project:changed", ...message });
		},
		broadcastTagFoldersChanged() {},
	} as unknown as EventBus;
	const context = (userId?: string) =>
		({ db, eventBus, userId, isAuthenticated: true }) as HostServiceContext;
	const caller = (userId?: string) =>
		createCallerFactory(projectRouter)(context(userId));
	return { db, sqlite, messages, context, caller };
}

describe("personal project tags", () => {
	test("list remains an array with empty tags for untagged projects", async () => {
		const h = setup();
		const rows = await h.caller("alice").list();
		expect(Array.isArray(rows)).toBe(true);
		expect(rows[0]).toMatchObject({ id: PROJECT, name: "demo", tags: [] });
	});

	test("normalizes, deduplicates and sorts tags, then replaces or clears them", async () => {
		const h = setup();
		const result = await h.caller("alice").setTags({
			projectId: PROJECT,
			tags: [" Dibsteur ", "dibsteur", "Alpha"],
		});
		expect(result.tags).toEqual(["alpha", "dibsteur"]);
		expect((await h.caller("alice").list())[0]?.tags).toEqual(result.tags);
		await h.caller("alice").setTags({ projectId: PROJECT, tags: ["new"] });
		expect((await h.caller("alice").list())[0]?.tags).toEqual(["new"]);
		await h.caller("alice").setTags({ projectId: PROJECT, tags: [] });
		expect(h.db.select().from(projectTags).all()).toEqual([]);
	});

	test("each user owns an independent set, including the same tag", async () => {
		const h = setup();
		await h
			.caller("alice")
			.setTags({ projectId: PROJECT, tags: ["shared", "mine"] });
		await h
			.caller("bob")
			.setTags({ projectId: PROJECT, tags: ["shared", "theirs"] });
		expect((await h.caller("alice").list())[0]?.tags).toEqual([
			"mine",
			"shared",
		]);
		expect((await h.caller("bob").list())[0]?.tags).toEqual([
			"shared",
			"theirs",
		]);
		expect(h.db.select().from(projectTags).all()).toHaveLength(4);
		await h.caller("alice").setTags({ projectId: PROJECT, tags: [] });
		expect((await h.caller("bob").list())[0]?.tags).toEqual([
			"shared",
			"theirs",
		]);
	});

	test("broadcast carries assignments for each recipient, never the actor's filtered tags", async () => {
		const h = setup();
		await h.caller("bob").setTags({ projectId: PROJECT, tags: ["bob-only"] });
		await h
			.caller("alice")
			.setTags({ projectId: PROJECT, tags: ["alice-only"] });
		const message = h.messages.at(-1);
		expect(message).toMatchObject({ projectId: PROJECT, eventType: "updated" });
		expect(message?.project).not.toHaveProperty("tags");
		expect(
			visibleWorkspaceTags(message?.project?.tagAssignments, "bob"),
		).toEqual(["bob-only"]);
		expect(
			visibleWorkspaceTags(message?.project?.tagAssignments, "alice"),
		).toEqual(["alice-only"]);
	});

	test("unknown creators use an empty key and remain visible until claimed", async () => {
		const h = setup();
		await h.caller().setTags({ projectId: PROJECT, tags: ["legacy"] });
		expect(h.db.select().from(projectTags).get()?.createdByUserId).toBe("");
		expect(getProjectTagAssignments(h.db, PROJECT)).toEqual([
			{ tag: "legacy", createdByUserId: null },
		]);
		expect((await h.caller("bob").list())[0]?.tags).toEqual(["legacy"]);
		await h.caller("bob").setTags({ projectId: PROJECT, tags: ["bob"] });
		await h.caller("alice").setTags({ projectId: PROJECT, tags: ["alice"] });
		expect((await h.caller().list())[0]?.tags).toEqual(["alice", "bob"]);
		await h.caller().setTags({ projectId: PROJECT, tags: ["legacy-again"] });
		expect((await h.caller("bob").list())[0]?.tags).toEqual(["legacy-again"]);
	});

	test("rejects invalid tags and over-cap sets without changing storage or broadcasting", async () => {
		const h = setup();
		await h.caller("alice").setTags({ projectId: PROJECT, tags: ["keep"] });
		for (const tags of [
			["   "],
			["a".repeat(WORKSPACE_TAG_MAX_LENGTH + 1)],
			Array.from(
				{ length: WORKSPACE_TAGS_MAX_PER_WORKSPACE + 1 },
				(_, i) => `tag-${i}`,
			),
		]) {
			await expect(
				h.caller("alice").setTags({ projectId: PROJECT, tags }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		expect((await h.caller("alice").list())[0]?.tags).toEqual(["keep"]);
		expect(h.messages).toHaveLength(1);
		const repeated = Array.from(
			{ length: WORKSPACE_TAGS_MAX_PER_WORKSPACE + 1 },
			() => " Same ",
		);
		expect(
			(await h.caller("alice").setTags({ projectId: PROJECT, tags: repeated }))
				.tags,
		).toEqual(["same"]);
	});

	test("rejects missing and soft-deleted projects without writing tags", async () => {
		const h = setup();
		await expect(
			h.caller("alice").setTags({ projectId: OTHER_PROJECT, tags: ["tag"] }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		h.db
			.update(projects)
			.set({ deletedAt: 1 })
			.where(eq(projects.id, PROJECT))
			.run();
		await expect(
			h.caller("alice").setTags({ projectId: PROJECT, tags: ["tag"] }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await h.caller("alice").list()).toEqual([]);
		expect(h.db.select().from(projectTags).all()).toEqual([]);
		expect(h.messages).toEqual([]);
	});

	test("ordinary project updates preserve tags and other users' assignments", async () => {
		const h = setup();
		await h.caller("alice").setTags({ projectId: PROJECT, tags: ["mine"] });
		await h.caller("bob").setTags({ projectId: PROJECT, tags: ["theirs"] });
		await h.caller("alice").update({ projectId: PROJECT, name: "renamed" });
		expect((await h.caller("alice").list())[0]?.tags).toEqual(["mine"]);
		expect((await h.caller("bob").list())[0]?.tags).toEqual(["theirs"]);
	});

	test("generated foreign key cascades all users' tags on hard deletion", async () => {
		const h = setup();
		await h.caller("alice").setTags({ projectId: PROJECT, tags: ["mine"] });
		await h.caller("bob").setTags({ projectId: PROJECT, tags: ["theirs"] });
		h.db.delete(projects).where(eq(projects.id, PROJECT)).run();
		expect(h.db.select().from(projectTags).all()).toEqual([]);
	});

	test("purge preserves personal collections while removing project-scoped settings", async () => {
		const h = setup();
		const folders = (userId: string) =>
			createCallerFactory(tagFoldersRouter)(h.context(userId));
		await folders("alice").upsert({
			scope: PROJECTS_TAG_SCOPE,
			tag: "collection",
			displayName: "Mine",
			color: "#ff0000",
		});
		await folders("bob").upsert({
			scope: PROJECTS_TAG_SCOPE,
			tag: "collection",
			displayName: "Theirs",
		});
		await folders("alice").upsert({ scope: PROJECT, tag: "workspace-folder" });
		await h
			.caller("alice")
			.setTags({ projectId: PROJECT, tags: ["collection"] });
		h.db
			.update(projects)
			.set({ deletedAt: 1 })
			.where(eq(projects.id, PROJECT))
			.run();
		expect(await purgeDeletedProject(h.context("alice"), PROJECT)).toBe(true);
		expect(h.db.select().from(projectTags).all()).toEqual([]);
		expect(getTagFolderSettings(h.db, PROJECT, "alice")).toEqual([]);
		expect((await folders("alice").list())[0]).toMatchObject({
			scope: PROJECTS_TAG_SCOPE,
			displayName: "Mine",
			color: "#ff0000",
		});
		expect((await folders("bob").list())[0]).toMatchObject({
			scope: PROJECTS_TAG_SCOPE,
			displayName: "Theirs",
		});
		await folders("alice").delete({
			scope: PROJECTS_TAG_SCOPE,
			tag: "collection",
		});
		expect(await folders("alice").list()).toEqual([]);
		expect(await folders("bob").list()).toHaveLength(1);
	});
});

describe("batch collection moves", () => {
	test("one call changes several projects and keeps other users' tags", async () => {
		const h = setup();
		h.db
			.insert(projects)
			.values({ id: OTHER_PROJECT, name: "other", repoPath: "/other" })
			.run();
		await h.caller("bob").setTags({ projectId: PROJECT, tags: ["bob"] });
		const result = await h.caller("alice").setTagsBatch({
			updates: [
				{ projectId: PROJECT, tags: [" Team "] },
				{ projectId: OTHER_PROJECT, tags: ["team"] },
			],
		});
		expect(result.map((project) => project.tags)).toEqual([["team"], ["team"]]);
		expect(
			(await h.caller("bob").list()).find((project) => project.id === PROJECT)
				?.tags,
		).toEqual(["bob"]);
		expect(h.messages.slice(-2).map((message) => message.projectId)).toEqual([
			PROJECT,
			OTHER_PROJECT,
		]);
	});
	test("missing or deleted project rejects the entire batch without broadcasts", async () => {
		const h = setup();
		for (const deleted of [false, true]) {
			if (deleted)
				h.db
					.insert(projects)
					.values({
						id: OTHER_PROJECT,
						name: "deleted",
						repoPath: "/deleted",
						deletedAt: 1,
					})
					.run();
			await expect(
				h.caller("alice").setTagsBatch({
					updates: [
						{ projectId: PROJECT, tags: ["changed"] },
						{ projectId: OTHER_PROJECT, tags: ["changed"] },
					],
				}),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			expect((await h.caller("alice").list())[0]?.tags).toEqual([]);
			expect(h.messages).toEqual([]);
		}
	});
});

test("batch database failure restores tags and publishes no partial events", async () => {
	const h = setup();
	h.db
		.insert(projects)
		.values({ id: OTHER_PROJECT, name: "other", repoPath: "/other" })
		.run();
	await h.caller("alice").setTags({ projectId: PROJECT, tags: ["keep"] });
	h.messages.splice(0);
	h.sqlite.run(
		`CREATE TRIGGER reject_batch BEFORE INSERT ON project_tags WHEN NEW.project_id = '${OTHER_PROJECT}' BEGIN SELECT RAISE(ABORT, 'reject batch'); END`,
	);
	await expect(
		h.caller("alice").setTagsBatch({
			updates: [
				{ projectId: PROJECT, tags: ["changed"] },
				{ projectId: OTHER_PROJECT, tags: ["changed"] },
			],
		}),
	).rejects.toThrow("reject batch");
	expect(
		(await h.caller("alice").list()).find((row) => row.id === PROJECT)?.tags,
	).toEqual(["keep"]);
	expect(h.messages).toEqual([]);
});
