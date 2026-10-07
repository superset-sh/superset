import { mock } from "bun:test";
import { randomUUID } from "node:crypto";
import * as schema from "@superset/db/schema";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const fixtureUrl = process.env.GITLAB_CONNECTION_PROOF_URL;

export async function connectionFixture() {
	if (!fixtureUrl) throw new Error("GitLab connection fixture not configured");
	const target = new URL(fixtureUrl);
	if (
		target.hostname !== "127.0.0.1" ||
		!target.port ||
		target.pathname !== "/superset_gitlab_connection_fixture_20261004" ||
		target.username !== "fixture" ||
		target.password !== "FIXTURE_ONLY_PASSWORD"
	)
		throw new Error("Refusing a non-fixture Postgres target");
	let queries = 0;
	const client = postgres(fixtureUrl, {
		max: 8,
		connection: { lock_timeout: 5000, statement_timeout: 10000 },
		debug: () => {
			queries++;
		},
	});
	const db = drizzle({ client, schema, casing: "snake_case" });
	mock.module("@superset/db/client", () => ({ db, dbWs: db }));
	mock.module("@superset/auth/env", () => ({
		env: { BETTER_AUTH_SECRET: "FIXTURE_ONLY_AUTH_SECRET" },
	}));
	mock.module("../../env", () => ({
		env: {
			GITLAB_OAUTH_CLIENT_ID: undefined,
			GITLAB_OAUTH_CLIENT_SECRET: undefined,
			GITLAB_ISSUER: undefined,
			LINEAR_CLIENT_ID: "FIXTURE_LINEAR_CLIENT",
			LINEAR_CLIENT_SECRET: "FIXTURE_LINEAR_SECRET",
		},
	}));
	process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
	const crypto = await import("../../router/plugins/crypto");
	mock.module("../../lib/connectors", () => ({
		...crypto,
		connectionById: () => {
			throw new Error("Unexpected connection lookup outside fixture path");
		},
		userConnection: () => {
			throw new Error("Unexpected user lookup outside fixture path");
		},
	}));
	const connection = await import("./connection");
	const refresh = await import("./refresh");
	const { withConnectionLock } = await import("@superset/db/utils");
	const { withRefreshedToken } = await import(
		"../../router/integration/token-refresh"
	);
	const { refreshLinearToken } = await import(
		"../../router/integration/linear/refresh"
	);
	const organizationIds: string[] = [];
	const userIds: string[] = [];
	async function identity() {
		const organizationId = randomUUID();
		const userId = randomUUID();
		await db.insert(schema.organizations).values({
			id: organizationId,
			name: "Fixture organization",
			slug: `fixture-${organizationId}`,
		});
		organizationIds.push(organizationId);
		await db.insert(schema.users).values({
			id: userId,
			name: "Fixture user",
			email: `${userId}@fixture.test`,
		});
		userIds.push(userId);
		return { organizationId, userId };
	}
	async function seed(
		overrides: Partial<typeof schema.connections.$inferInsert> = {},
	) {
		const { organizationId, userId } = await identity();
		const [row] = await db
			.insert(schema.connections)
			.values({
				organizationId,
				connectedByUserId: userId,
				connector: "gitlab",
				ownerKind: "org",
				authMethod: "token",
				accessToken: await crypto.encryptSecret("OLD_FIXTURE_TOKEN"),
				externalAccountId: `gitlab.com:project:${randomUUID()}/Widget`,
				state: {
					provider: "gitlab",
					host: "gitlab.com",
					groupPath: "Acme/Widget",
					auth: "token",
					webhookSecret: "OLD_FIXTURE_HOOK",
				},
				...overrides,
			})
			.returning();
		if (!row) throw new Error("Fixture connection insert failed");
		return row;
	}
	return {
		db,
		client,
		crypto,
		connection,
		refresh,
		identity,
		seed,
		queryCount: () => queries,
		withConnectionLock,
		withRefreshedToken,
		refreshLinearToken,
		close: async () => {
			try {
				if (organizationIds.length)
					await db
						.delete(schema.organizations)
						.where(inArray(schema.organizations.id, organizationIds));
				if (userIds.length)
					await db
						.delete(schema.users)
						.where(inArray(schema.users.id, userIds));
			} finally {
				await client.end();
			}
		},
	};
}
