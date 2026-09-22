import { describe, expect, test } from "bun:test";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import { getConnector } from "@superset/shared/connectors";
import { type LegacyIdentity, legacyConnectionRow } from "./legacy";

const seal = async (plaintext: string) => `sealed(${plaintext})`;

const CREATED = new Date("2026-03-01T00:00:00Z");
const UPDATED = new Date("2026-09-01T00:00:00Z");

function legacy(
	overrides: Partial<SelectIntegrationConnection>,
): SelectIntegrationConnection {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		organizationId: "22222222-2222-4222-8222-222222222222",
		connectedByUserId: "33333333-3333-4333-8333-333333333333",
		provider: "linear",
		accessToken: "access",
		refreshToken: "refresh",
		tokenExpiresAt: new Date("2026-09-20T00:00:00Z"),
		disconnectedAt: null,
		disconnectReason: null,
		externalOrgId: "linear-org",
		externalOrgName: "Acme",
		config: null,
		createdAt: CREATED,
		updatedAt: UPDATED,
		...overrides,
	};
}

function identity(overrides: Partial<LegacyIdentity>): LegacyIdentity {
	return {
		externalId: "external-user",
		externalScopeId: "linear-org",
		displayName: "Ada",
		metadata: null,
		...overrides,
	};
}

describe("legacyConnectionRow", () => {
	test("keeps the id, the timestamps and the disconnect state", async () => {
		const disconnectedAt = new Date("2026-08-01T00:00:00Z");
		const { row } = await legacyConnectionRow(
			legacy({ disconnectedAt, disconnectReason: "revoked" }),
			[],
			seal,
		);
		expect(row.id).toBe("11111111-1111-4111-8111-111111111111");
		expect(row.createdAt).toBe(CREATED);
		expect(row.updatedAt).toBe(UPDATED);
		expect(row.disconnectedAt).toBe(disconnectedAt);
		expect(row.disconnectReason).toBe("revoked");
	});

	test("seals both tokens and never carries a plaintext one", async () => {
		const { row } = await legacyConnectionRow(legacy({}), [], seal);
		expect(row.accessToken).toBe("sealed(access)");
		expect(row.refreshToken).toBe("sealed(refresh)");
		expect(JSON.stringify(row)).not.toContain('"access"');
	});

	test("leaves a missing refresh token null", async () => {
		const { row } = await legacyConnectionRow(
			legacy({ refreshToken: null }),
			[],
			seal,
		);
		expect(row.refreshToken).toBeNull();
	});

	test("moves the old config to state unchanged", async () => {
		const config = { provider: "linear", newTasksTeamId: "team-1" } as const;
		const { row } = await legacyConnectionRow(legacy({ config }), [], seal);
		expect(row.state).toEqual(config);
		expect(row.config).toBeNull();
	});

	test("takes scope and auth method from the connector definition", async () => {
		for (const provider of [
			"linear",
			"slack",
			"google",
			"notion",
			"sentry",
			"microsoft_teams",
		] as const) {
			const { row } = await legacyConnectionRow(legacy({ provider }), [], seal);
			const connector = getConnector(provider);
			expect(row.connector).toBe(provider);
			expect(row.ownerKind).toBe(connector?.scope as "user" | "org");
			expect(row.authMethod).toBe(connector?.methods[0]?.type as string);
		}
	});

	test("a user-scoped row always gets an external user id", async () => {
		for (const provider of ["linear", "slack", "google", "notion"] as const) {
			const { row } = await legacyConnectionRow(legacy({ provider }), [], seal);
			expect(row.ownerKind).toBe("user");
			expect(row.externalUserId).toBeTruthy();
		}
	});

	test("an org-scoped row gets none", async () => {
		const { row, externalUserSource } = await legacyConnectionRow(
			legacy({ provider: "sentry", externalOrgId: "acme-slug" }),
			[identity({ externalScopeId: "acme-slug" })],
			seal,
		);
		expect(row.ownerKind).toBe("org");
		expect(row.externalUserId).toBeNull();
		expect(externalUserSource).toBe("not-required");
	});

	test("uses the identity recorded for this external account", async () => {
		const { row, externalUserSource } = await legacyConnectionRow(
			legacy({}),
			[
				identity({ externalScopeId: "another-org", externalId: "wrong" }),
				identity({ externalId: "linear-user", displayName: "Ada" }),
			],
			seal,
		);
		expect(row.externalUserId).toBe("linear-user");
		expect(row.externalUserLabel).toBe("Ada");
		expect(externalUserSource).toBe("identity");
	});

	test("falls back to the Superset user when no identity was recorded", async () => {
		const { row, externalUserSource } = await legacyConnectionRow(
			legacy({}),
			[identity({ externalScopeId: "another-org" })],
			seal,
		);
		expect(row.externalUserId).toBe("33333333-3333-4333-8333-333333333333");
		expect(row.externalUserLabel).toBeNull();
		expect(externalUserSource).toBe("superset-user");
	});

	test("lowercases a Google address and takes the subject id from the identity", async () => {
		const { row, externalUserSource } = await legacyConnectionRow(
			legacy({
				provider: "google",
				externalOrgId: "Ada@Example.com",
				externalOrgName: "Ada@Example.com",
			}),
			[
				identity({
					externalId: "ada@example.com",
					externalScopeId: null,
					metadata: { provider: "google", sub: "google-sub" },
				}),
			],
			seal,
		);
		expect(row.externalAccountId).toBe("ada@example.com");
		expect(row.externalUserId).toBe("google-sub");
		expect(row.externalUserLabel).toBe("ada@example.com");
		expect(externalUserSource).toBe("identity");
	});

	test("stores the Slack bot token where the app reads it", async () => {
		const { row } = await legacyConnectionRow(
			legacy({
				provider: "slack",
				accessToken: "xoxb",
				refreshToken: null,
				tokenExpiresAt: null,
				externalOrgId: "T123",
				config: { provider: "slack" },
			}),
			[],
			seal,
		);
		expect(row.accessToken).toBe("sealed(xoxb)");
		expect(row.config).toEqual({
			bot_token: "sealed(xoxb)",
			bot_user_id: null,
			slack_user_id: null,
		});
		expect(row.state).toEqual({ provider: "slack" });
	});

	test("refuses a row with no external account id", async () => {
		await expect(
			legacyConnectionRow(legacy({ externalOrgId: null }), [], seal),
		).rejects.toThrow("no external account id");
	});
});
