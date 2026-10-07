import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { organizations, users } from "./auth";
import { automationTriggerKindEnum, integrationProviderEnum } from "./enums";
import {
	gitlabCloudProjects,
	gitlabEnvironmentProjects,
	gitlabWorkspaceCheckouts,
	type InsertGitlabCloudProject,
} from "./gitlab";
import { cloudWorkspaces, connections, environments } from "./schema";
import type { GitLabConfig, IntegrationConfig } from "./types";

const project = {
	projectId: "9007199254740993",
	pathWithNamespace: "Acme/Team/Widget",
	cloneUrl: "https://git.fixture.test:8443/Acme/Team/Widget.git",
};
const mock = drizzle.mock();

test("typed project upsert uses connection and exact text project ID as conflict identity", () => {
	const values: InsertGitlabCloudProject = {
		organizationId: randomUUID(),
		userId: randomUUID(),
		connectionId: randomUUID(),
		...project,
	};
	const query = mock
		.insert(gitlabCloudProjects)
		.values(values)
		.onConflictDoUpdate({
			target: [gitlabCloudProjects.connectionId, gitlabCloudProjects.projectId],
			set: { defaultBranch: "Feature/Case" },
		})
		.toSQL();
	expect(query.params).toContain(project.projectId);
	expect(query.params).toContain(project.cloneUrl);
	expect(query.params).toContain("Feature/Case");
	expect(query.sql).toContain(
		'on conflict ("connection_id","project_id") do update',
	);
	expect(query.sql).not.toContain(project.cloneUrl);
});

test("typed lookup keeps selected connection identity in its parameterized predicate", () => {
	const connectionId = randomUUID();
	const query = mock
		.select()
		.from(gitlabCloudProjects)
		.where(
			and(
				eq(gitlabCloudProjects.connectionId, connectionId),
				eq(gitlabCloudProjects.projectId, project.projectId),
			),
		)
		.toSQL();
	expect(query.params).toEqual([connectionId, project.projectId]);
	expect(query.sql).toContain('"gitlab_cloud_projects"."connection_id"');
	expect(query.sql).toContain('"gitlab_cloud_projects"."project_id"');
});

test("GitLab integration and automation enums accept retained GitLab capabilities", () => {
	expect(integrationProviderEnum.parse("gitlab")).toBe("gitlab");
	expect(integrationProviderEnum.parse("github")).toBe("github");
	expect(automationTriggerKindEnum.parse("gitlab")).toBe("gitlab");
	expect(automationTriggerKindEnum.parse("github")).toBe("github");
});

const fixtureUrl = process.env.GITLAB_SCHEMA_PROOF_URL;
const client = fixtureUrl ? postgres(fixtureUrl, { max: 1 }) : null;
const live = client ? drizzle(client) : null;
const config: GitLabConfig = {
	provider: "gitlab",
	host: "git.fixture.test:8443",
	groupPath: "Acme/Team",
	auth: "token",
	webhookSecret: "FIXTURE_ONLY_WEBHOOK_SECRET",
	scopeKind: "group",
	scopeId: "9",
};
const state: IntegrationConfig = config;

const organizationIds: string[] = [];
const userIds: string[] = [];

async function parents() {
	if (!live) throw new Error("GitLab schema fixture not configured");
	const ids = {
		organizationId: randomUUID(),
		userId: randomUUID(),
		connectionId: randomUUID(),
		otherConnectionId: randomUUID(),
		cloudWorkspaceId: randomUUID(),
		environmentId: randomUUID(),
	};
	organizationIds.push(ids.organizationId);
	userIds.push(ids.userId);
	await live.insert(organizations).values({
		id: ids.organizationId,
		name: "Fixture organization",
		slug: `fixture-${ids.organizationId}`,
	});
	await live.insert(users).values({
		id: ids.userId,
		name: "Fixture user",
		email: `${ids.userId}@fixture.test`,
	});
	await live.insert(connections).values([
		{
			id: ids.connectionId,
			organizationId: ids.organizationId,
			connectedByUserId: ids.userId,
			ownerKind: "org",
			authMethod: "token",
			accessToken: "FIXTURE_ONLY_TOKEN",
			externalAccountId: ids.connectionId,
			connector: "gitlab",
			state,
		},
		{
			id: ids.otherConnectionId,
			organizationId: ids.organizationId,
			connectedByUserId: ids.userId,
			ownerKind: "user",
			externalUserId: ids.userId,
			authMethod: "token",
			accessToken: "FIXTURE_ONLY_TOKEN",
			externalAccountId: ids.otherConnectionId,
			connector: "gitlab",
			state: { ...state, host: "other.fixture.test" },
		},
	]);
	await live.insert(environments).values({
		id: ids.environmentId,
		organizationId: ids.organizationId,
		name: "Fixture environment",
		sourceKind: "image",
		sourceRef: "fixture:image",
	});
	await live.insert(cloudWorkspaces).values({
		id: ids.cloudWorkspaceId,
		organizationId: ids.organizationId,
		environmentId: ids.environmentId,
		name: "Fixture workspace",
		branch: "fixture/branch",
		baseBranch: "main",
		providerSandboxId: `fixture-${ids.cloudWorkspaceId}`,
	});
	return ids;
}

describe.skipIf(!fixtureUrl)(
	"generated DDL on owned disposable loopback Postgres",
	() => {
		beforeAll(async () => {
			if (!fixtureUrl || !client)
				throw new Error("GitLab schema fixture not configured");
			const target = new URL(fixtureUrl);
			if (
				target.hostname !== "127.0.0.1" ||
				!target.port ||
				target.pathname !== "/superset_gitlab_schema_fixture_20261004" ||
				target.username !== "fixture" ||
				target.password !== "FIXTURE_ONLY_PASSWORD"
			)
				throw new Error("Refusing a non-fixture Postgres target");
			const [database] = await client`select current_database() as name`;
			expect(database?.name).toBe("superset_gitlab_schema_fixture_20261004");
		});
		afterAll(async () => {
			try {
				if (live && organizationIds.length)
					await live
						.delete(organizations)
						.where(inArray(organizations.id, organizationIds));
				if (live && userIds.length)
					await live.delete(users).where(inArray(users.id, userIds));
			} finally {
				await client?.end();
			}
		});

		test("defaults and connection JSON round-trip retain text IDs, namespace case, host ports and time zones", async () => {
			if (!live) throw new Error("GitLab schema fixture not configured");
			const ids = await parents();
			const [inserted] = await live
				.insert(gitlabCloudProjects)
				.values({
					organizationId: ids.organizationId,
					connectionId: ids.connectionId,
					...project,
				})
				.returning();
			expect(inserted?.id).toMatch(/^[0-9a-f-]{36}$/);
			expect(inserted?.createdAt).toBeInstanceOf(Date);
			expect(inserted).toMatchObject({ ...project, defaultBranch: "main" });
			const [connection] = await live
				.select({ state: connections.state })
				.from(connections)
				.where(eq(connections.id, ids.connectionId));
			expect(connection?.state).toEqual(config);
			const createdAt = new Date("2026-10-04T12:30:00+05:30");
			const [updated] = await live
				.update(gitlabCloudProjects)
				.set({ createdAt, defaultBranch: "Feature/Case" })
				.where(eq(gitlabCloudProjects.id, inserted?.id ?? ""))
				.returning();
			expect(updated?.createdAt.toISOString()).toBe("2026-10-04T07:00:00.000Z");
			expect(updated?.defaultBranch).toBe("Feature/Case");
			if (!client) throw new Error("GitLab schema fixture not configured");
			const [column] =
				await client`select data_type from information_schema.columns where table_name = 'gitlab_cloud_projects' and column_name = 'created_at'`;
			expect(column?.data_type).toBe("timestamp with time zone");
		});

		test("same project number on two connections is allowed, same-connection duplicate rejected and upsert remains scoped", async () => {
			if (!live) throw new Error("GitLab schema fixture not configured");
			const ids = await parents();
			const values = {
				organizationId: ids.organizationId,
				connectionId: ids.connectionId,
				...project,
			};
			await live.insert(gitlabCloudProjects).values([
				values,
				{
					...values,
					connectionId: ids.otherConnectionId,
					cloneUrl: "https://other.fixture.test/Acme/Team/Widget.git",
				},
			]);
			await expect(
				live.insert(gitlabCloudProjects).values(values).execute(),
			).rejects.toMatchObject({ cause: { code: "23505" } });
			await live
				.insert(gitlabCloudProjects)
				.values(values)
				.onConflictDoUpdate({
					target: [
						gitlabCloudProjects.connectionId,
						gitlabCloudProjects.projectId,
					],
					set: { defaultBranch: "Feature/Case" },
				});
			const rows = await live
				.select()
				.from(gitlabCloudProjects)
				.where(eq(gitlabCloudProjects.organizationId, ids.organizationId));
			expect(rows).toHaveLength(2);
			expect(
				rows.find((row) => row.connectionId === ids.connectionId)
					?.defaultBranch,
			).toBe("Feature/Case");
			expect(
				rows.find((row) => row.connectionId === ids.otherConnectionId)
					?.defaultBranch,
			).toBe("main");
		});

		test("checkout and environment primary keys reject duplicate links and all missing parents fail", async () => {
			if (!live) throw new Error("GitLab schema fixture not configured");
			const ids = await parents();
			const workspace = {
				cloudWorkspaceId: ids.cloudWorkspaceId,
				connectionId: ids.connectionId,
				...project,
			};
			const environment = {
				environmentId: ids.environmentId,
				connectionId: ids.connectionId,
				...project,
			};
			expect(
				(
					await live
						.insert(gitlabWorkspaceCheckouts)
						.values(workspace)
						.returning()
				)[0]?.defaultBranch,
			).toBe("main");
			expect(
				(
					await live
						.insert(gitlabEnvironmentProjects)
						.values(environment)
						.returning()
				)[0]?.defaultBranch,
			).toBe("main");
			await expect(
				live.insert(gitlabWorkspaceCheckouts).values(workspace).execute(),
			).rejects.toMatchObject({ cause: { code: "23505" } });
			await expect(
				live.insert(gitlabEnvironmentProjects).values(environment).execute(),
			).rejects.toMatchObject({ cause: { code: "23505" } });
			await expect(
				live
					.insert(gitlabCloudProjects)
					.values({
						organizationId: randomUUID(),
						connectionId: ids.connectionId,
						...project,
					})
					.execute(),
			).rejects.toMatchObject({ cause: { code: "23503" } });
			await expect(
				live
					.insert(gitlabCloudProjects)
					.values({
						organizationId: ids.organizationId,
						connectionId: randomUUID(),
						...project,
					})
					.execute(),
			).rejects.toMatchObject({ cause: { code: "23503" } });
			await expect(
				live
					.insert(gitlabWorkspaceCheckouts)
					.values({ ...workspace, cloudWorkspaceId: randomUUID() })
					.execute(),
			).rejects.toMatchObject({ cause: { code: "23503" } });
			await expect(
				live
					.insert(gitlabEnvironmentProjects)
					.values({ ...environment, environmentId: randomUUID() })
					.execute(),
			).rejects.toMatchObject({ cause: { code: "23503" } });
		});

		test("connection deletion cascades all three metadata tables while retaining another connection's project", async () => {
			if (!live || !client)
				throw new Error("GitLab schema fixture not configured");
			const ids = await parents();
			await live.insert(gitlabCloudProjects).values([
				{
					organizationId: ids.organizationId,
					connectionId: ids.connectionId,
					...project,
				},
				{
					organizationId: ids.organizationId,
					connectionId: ids.otherConnectionId,
					...project,
				},
			]);
			await live.insert(gitlabWorkspaceCheckouts).values({
				cloudWorkspaceId: ids.cloudWorkspaceId,
				connectionId: ids.connectionId,
				...project,
			});
			await live.insert(gitlabEnvironmentProjects).values({
				environmentId: ids.environmentId,
				connectionId: ids.connectionId,
				...project,
			});
			await client`delete from connections where id = ${ids.connectionId}`;
			expect(
				await live
					.select()
					.from(gitlabCloudProjects)
					.where(eq(gitlabCloudProjects.connectionId, ids.connectionId)),
			).toEqual([]);
			expect(
				await live
					.select()
					.from(gitlabWorkspaceCheckouts)
					.where(
						eq(gitlabWorkspaceCheckouts.cloudWorkspaceId, ids.cloudWorkspaceId),
					),
			).toEqual([]);
			expect(
				await live
					.select()
					.from(gitlabEnvironmentProjects)
					.where(
						eq(gitlabEnvironmentProjects.environmentId, ids.environmentId),
					),
			).toEqual([]);
			expect(
				await live
					.select()
					.from(gitlabCloudProjects)
					.where(eq(gitlabCloudProjects.connectionId, ids.otherConnectionId)),
			).toHaveLength(1);
		});

		test("workspace, environment and organization deletion cascade their metadata links", async () => {
			if (!live || !client)
				throw new Error("GitLab schema fixture not configured");
			const ids = await parents();
			await live.insert(gitlabCloudProjects).values({
				organizationId: ids.organizationId,
				connectionId: ids.connectionId,
				...project,
			});
			await live.insert(gitlabWorkspaceCheckouts).values({
				cloudWorkspaceId: ids.cloudWorkspaceId,
				connectionId: ids.connectionId,
				...project,
			});
			await live.insert(gitlabEnvironmentProjects).values({
				environmentId: ids.environmentId,
				connectionId: ids.connectionId,
				...project,
			});
			await client`delete from cloud_workspaces where id = ${ids.cloudWorkspaceId}`;
			await client`delete from environments where id = ${ids.environmentId}`;
			expect(
				await live
					.select()
					.from(gitlabWorkspaceCheckouts)
					.where(
						eq(gitlabWorkspaceCheckouts.cloudWorkspaceId, ids.cloudWorkspaceId),
					),
			).toEqual([]);
			expect(
				await live
					.select()
					.from(gitlabEnvironmentProjects)
					.where(
						eq(gitlabEnvironmentProjects.environmentId, ids.environmentId),
					),
			).toEqual([]);
			expect(
				await live
					.select()
					.from(gitlabCloudProjects)
					.where(eq(gitlabCloudProjects.organizationId, ids.organizationId)),
			).toHaveLength(1);
			await client`delete from auth.organizations where id = ${ids.organizationId}`;
			expect(
				await live
					.select()
					.from(gitlabCloudProjects)
					.where(eq(gitlabCloudProjects.organizationId, ids.organizationId)),
			).toEqual([]);
		});
	},
);
