import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { SESSIONS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import { TRPCClientError } from "@trpc/client";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { seedProject } from "../helpers/seed";

describe("tag folders router integration", () => {
	let host: TestHost | undefined;

	afterEach(async () => {
		await host?.dispose();
		host = undefined;
	});

	test("accepts Sessions and existing project scopes", async () => {
		host = await createTestHost();
		const project = seedProject(host, { repoPath: "/tmp/tag-folder-project" });

		await host.trpc.tagFolders.upsert.mutate({
			scope: SESSIONS_TAG_SCOPE,
			tag: "api",
			color: "#0000ff",
		});
		await host.trpc.tagFolders.upsert.mutate({
			scope: project.id,
			tag: "api",
			color: "#ff0000",
		});

		const rows = await host.trpc.tagFolders.list.query();
		expect(rows).toHaveLength(2);
	});

	test("keeps the deprecated project API on the canonical folder table", async () => {
		host = await createTestHost();
		const project = seedProject(host, { repoPath: "/tmp/legacy-tag-folder" });
		const sentMessages: string[] = [];
		host.eventBus.handleOpen({
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		});

		await host.trpc.project.setTagSetting.mutate({
			projectId: project.id,
			tag: " API ",
			displayName: "Legacy API",
			color: "#ff0000",
		});

		expect(await host.trpc.tagFolders.list.query()).toEqual([
			{
				scope: project.id,
				tag: "api",
				displayName: "Legacy API",
				color: "#ff0000",
				tabOrder: null,
			},
		]);
		expect((await host.trpc.project.list.query())[0]?.tagSettings).toEqual([
			{
				tag: "api",
				displayName: "Legacy API",
				color: "#ff0000",
				tabOrder: null,
			},
		]);
		expect(sentMessages.map((message) => JSON.parse(message))).toContainEqual({
			type: "project:changed",
			projectId: project.id,
			eventType: "updated",
			project: expect.objectContaining({
				id: project.id,
				tagSettings: [
					{
						tag: "api",
						displayName: "Legacy API",
						color: "#ff0000",
						tabOrder: null,
					},
				],
			}),
			occurredAt: expect.any(Number),
		});

		sentMessages.length = 0;
		await host.trpc.project.deleteTagSetting.mutate({
			projectId: project.id,
			tag: "api",
		});
		expect(await host.trpc.tagFolders.list.query()).toEqual([]);
		expect(sentMessages.map((message) => JSON.parse(message))).toContainEqual({
			type: "project:changed",
			projectId: project.id,
			eventType: "updated",
			project: expect.objectContaining({
				id: project.id,
				tagSettings: [],
			}),
			occurredAt: expect.any(Number),
		});
	});

	test("rejects arbitrary strings and nonexistent project UUIDs", async () => {
		host = await createTestHost();
		await expect(
			host.trpc.tagFolders.upsert.mutate({
				scope: "arbitrary-owner",
				tag: "api",
				color: "#ff0000",
			}),
		).rejects.toBeInstanceOf(TRPCClientError);

		try {
			await host.trpc.tagFolders.upsert.mutate({
				scope: randomUUID(),
				tag: "api",
				color: "#ff0000",
			});
			expect.unreachable("missing project scope should reject");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCClientError);
			expect((error as TRPCClientError<unknown>).data?.code).toBe("NOT_FOUND");
		}
	});

	test("normalizes valid tags and rejects tags the store cannot represent", async () => {
		host = await createTestHost();
		await host.trpc.tagFolders.upsert.mutate({
			scope: SESSIONS_TAG_SCOPE,
			tag: "  Perf Work  ",
			color: "#ff0000",
		});
		expect(await host.trpc.tagFolders.list.query()).toMatchObject([
			{ scope: SESSIONS_TAG_SCOPE, tag: "perf work" },
		]);
		await expect(
			host.trpc.tagFolders.upsert.mutate({
				scope: SESSIONS_TAG_SCOPE,
				tag: "   ",
				color: "#ff0000",
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("project removal atomically cleans its folder rows but keeps Sessions", async () => {
		host = await createTestHost();
		const sentMessages: string[] = [];
		host.eventBus.handleOpen({
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		});
		const project = seedProject(host, { repoPath: "/tmp/tag-folder-project" });
		await host.trpc.tagFolders.upsert.mutate({
			scope: project.id,
			tag: "api",
			color: "#ff0000",
		});
		await host.trpc.tagFolders.upsert.mutate({
			scope: SESSIONS_TAG_SCOPE,
			tag: "api",
			color: "#0000ff",
		});
		sentMessages.length = 0;

		await host.trpc.project.remove.mutate({ projectId: project.id });
		expect(sentMessages.map((message) => JSON.parse(message))).toContainEqual({
			type: "tag-folders:changed",
			scope: project.id,
			settings: [],
			occurredAt: expect.any(Number),
		});
		const rows = await host.trpc.tagFolders.list.query();
		expect(rows).toEqual([
			{
				scope: SESSIONS_TAG_SCOPE,
				tag: "api",
				displayName: null,
				color: "#0000ff",
				tabOrder: null,
			},
		]);
	});
});
