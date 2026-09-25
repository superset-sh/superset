import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

interface FakeMember {
	organizationId: string;
	userId: string;
	role: "owner" | "member";
}

const USER_ID = "user-1";
let memberships: FakeMember[] = [];

const dialect = new PgDialect();
const params = (condition: SQL) =>
	dialect.sqlToQuery(condition).params as string[];

// The two count queries differ only by the `role = 'owner'` term, so the
// parameter list tells them apart: [org, user] or [org, "owner", user].
mock.module("@superset/db/client", () => ({
	db: {
		query: {
			members: {
				findMany: async () =>
					memberships.filter(
						(member) => member.userId === USER_ID && member.role === "owner",
					),
			},
		},
		select: () => ({
			from: () => ({
				where: async (condition: SQL) => {
					const [organizationId, ...rest] = params(condition);
					const ownersOnly = rest.includes("owner");
					return [
						{
							value: memberships.filter(
								(member) =>
									member.organizationId === organizationId &&
									member.userId !== USER_ID &&
									(!ownersOnly || member.role === "owner"),
							).length,
						},
					];
				},
			}),
		}),
	},
	dbWs: {},
}));

const { findOrganizationSolelyOwnedBy } = await import(
	"./findOrganizationSolelyOwnedBy"
);

describe("findOrganizationSolelyOwnedBy", () => {
	beforeEach(() => {
		memberships = [];
	});

	test("names an organization whose only owner is this user and that has other members", async () => {
		memberships = [
			{ organizationId: "org-shared", userId: USER_ID, role: "owner" },
			{ organizationId: "org-shared", userId: "user-2", role: "member" },
		];
		expect(await findOrganizationSolelyOwnedBy(USER_ID)).toBe("org-shared");
	});

	test("ignores an organization where this user is its only member", async () => {
		memberships = [
			{ organizationId: "org-solo", userId: USER_ID, role: "owner" },
		];
		expect(await findOrganizationSolelyOwnedBy(USER_ID)).toBeNull();
	});

	test("ignores an organization that has another owner", async () => {
		memberships = [
			{ organizationId: "org-shared", userId: USER_ID, role: "owner" },
			{ organizationId: "org-shared", userId: "user-2", role: "owner" },
			{ organizationId: "org-shared", userId: "user-3", role: "member" },
		];
		expect(await findOrganizationSolelyOwnedBy(USER_ID)).toBeNull();
	});

	test("ignores an organization where this user is not an owner", async () => {
		memberships = [
			{ organizationId: "org-shared", userId: USER_ID, role: "member" },
			{ organizationId: "org-shared", userId: "user-2", role: "member" },
		];
		expect(await findOrganizationSolelyOwnedBy(USER_ID)).toBeNull();
	});
});
