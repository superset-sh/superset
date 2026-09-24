import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

interface FakeOrganization {
	id: string;
	memberIds: string[];
	stripeCustomerId: string | null;
	subscription?: { stripeSubscriptionId: string; plan: string };
}

interface FakeCustomer {
	deleted: boolean;
	activeSubscriptionIds: string[];
	charges: Array<{ status: string; refunded?: boolean }>;
}

const USER_ID = "user-1";

let organizations: FakeOrganization[] = [];
let customers: Map<string, FakeCustomer>;
let log: string[] = [];
let posthogResponse: () => Response;
let posthogRequests: Array<{ url: string; init: RequestInit }> = [];
let failCustomerDelete: Error | null = null;

const dialect = new PgDialect();
const firstParam = (condition: SQL) =>
	dialect.sqlToQuery(condition).params[0] as string;
const organizationById = (id: string) => {
	const organization = organizations.find((org) => org.id === id);
	if (!organization) throw new Error(`no fake organization ${id}`);
	return organization;
};
const customerById = (id: string) => {
	const customer = customers.get(id);
	if (!customer) throw new Error(`no fake customer ${id}`);
	return customer;
};

mock.module("../../env", () => ({
	env: {
		POSTHOG_API_HOST: "https://posthog.test",
		POSTHOG_PROJECT_ID: "264803",
		POSTHOG_API_KEY: "phx_test",
	},
}));

mock.module("@superset/db/client", () => {
	const tx = {
		delete: () => ({ where: async () => {} }),
		update: () => ({ set: () => ({ where: async () => {} }) }),
	};
	return {
		db: {
			query: {
				members: {
					findMany: async () =>
						organizations
							.filter((org) => org.memberIds.includes(USER_ID))
							.map((org) => ({ organizationId: org.id, userId: USER_ID })),
				},
				subscriptions: {
					findFirst: async ({ where }: { where: SQL }) => {
						const subscription = organizationById(
							firstParam(where),
						).subscription;
						return subscription && { ...subscription, status: "active" };
					},
				},
				organizations: {
					findFirst: async ({ where }: { where: SQL }) => {
						const organization = organizationById(firstParam(where));
						return {
							id: organization.id,
							stripeCustomerId: organization.stripeCustomerId,
						};
					},
				},
			},
			select: () => ({
				from: () => ({
					where: async (condition: SQL) => [
						{
							value:
								organizationById(firstParam(condition)).memberIds.length - 1,
						},
					],
				}),
			}),
			delete: () => ({
				where: async (condition: SQL) => {
					log.push(`organization.delete ${firstParam(condition)}`);
				},
			}),
		},
		dbWs: {
			transaction: async (run: (transaction: typeof tx) => Promise<void>) => {
				await run(tx);
				log.push("tombstone");
			},
		},
	};
});

mock.module("@superset/auth/stripe", () => ({
	stripeClient: {
		subscriptions: {
			retrieve: async () => ({ items: { data: [{ id: "si_1" }] } }),
			update: async (
				id: string,
				params: { items: Array<{ quantity: number }> },
			) => {
				log.push(`subscription.update ${id} ${params.items[0]?.quantity}`);
			},
			list: async ({ customer }: { customer: string }) => ({
				data: customerById(customer).activeSubscriptionIds.map((id) => ({
					id,
				})),
			}),
			cancel: async (id: string) => {
				log.push(`subscription.cancel ${id}`);
			},
		},
		charges: {
			list: ({ customer }: { customer: string }) => {
				log.push(`charges.list ${customer}`);
				const { charges } = customerById(customer);
				return (async function* () {
					yield* charges;
				})();
			},
		},
		customers: {
			del: async (id: string) => {
				if (failCustomerDelete) throw failCustomerDelete;
				const customer = customerById(id);
				if (customer.deleted) {
					throw Object.assign(new Error(`No such customer: '${id}'`), {
						code: "resource_missing",
					});
				}
				customer.deleted = true;
				log.push(`customer.delete ${id}`);
			},
		},
	},
}));

const { purgeAccount } = await import("./purgeAccount");
const purge = () => purgeAccount(USER_ID);

const realFetch = globalThis.fetch;

describe("purgeAccount", () => {
	beforeEach(() => {
		organizations = [];
		customers = new Map();
		log = [];
		posthogRequests = [];
		failCustomerDelete = null;
		posthogResponse = () =>
			Response.json(
				{ persons_found: 1, persons_deleted: 1, deletion_errors: [] },
				{ status: 202 },
			);
		globalThis.fetch = (async (url: string, init: RequestInit) => {
			posthogRequests.push({ url, init });
			log.push("posthog.delete");
			return posthogResponse();
		}) as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	test("deletes the PostHog person with their events, then an uncharged customer, before tombstoning", async () => {
		organizations = [
			{ id: "org-solo", memberIds: [USER_ID], stripeCustomerId: "cus_solo" },
		];
		customers.set("cus_solo", {
			deleted: false,
			activeSubscriptionIds: ["sub_solo"],
			charges: [{ status: "failed" }],
		});

		await purge();

		expect(posthogRequests).toHaveLength(1);
		const [request] = posthogRequests;
		expect(request?.url).toBe(
			"https://posthog.test/api/projects/264803/persons/bulk_delete/",
		);
		expect(request?.init.method).toBe("POST");
		expect(new Headers(request?.init.headers).get("authorization")).toBe(
			"Bearer phx_test",
		);
		expect(JSON.parse(request?.init.body as string)).toEqual({
			distinct_ids: [USER_ID],
			delete_events: true,
		});
		expect(log).toEqual([
			"posthog.delete",
			"subscription.cancel sub_solo",
			"charges.list cus_solo",
			"customer.delete cus_solo",
			"organization.delete org-solo",
			"tombstone",
		]);
	});

	test("keeps a customer that was ever successfully charged, even if refunded", async () => {
		organizations = [
			{ id: "org-paid", memberIds: [USER_ID], stripeCustomerId: "cus_paid" },
		];
		customers.set("cus_paid", {
			deleted: false,
			activeSubscriptionIds: [],
			charges: [{ status: "failed" }, { status: "succeeded", refunded: true }],
		});

		await purge();

		expect(customerById("cus_paid").deleted).toBe(false);
		expect(log).toEqual([
			"posthog.delete",
			"charges.list cus_paid",
			"organization.delete org-paid",
			"tombstone",
		]);
	});

	test("leaves a shared organization's customer alone and lowers its seats", async () => {
		organizations = [
			{
				id: "org-shared",
				memberIds: [USER_ID, "user-2"],
				stripeCustomerId: "cus_shared",
				subscription: { stripeSubscriptionId: "sub_shared", plan: "pro" },
			},
		];

		await purge();

		expect(log).toEqual([
			"posthog.delete",
			"subscription.update sub_shared 1",
			"tombstone",
		]);
	});

	test("re-running after the person and customer are already gone completes the purge", async () => {
		organizations = [
			{ id: "org-solo", memberIds: [USER_ID], stripeCustomerId: "cus_gone" },
		];
		customers.set("cus_gone", {
			deleted: true,
			activeSubscriptionIds: [],
			charges: [],
		});
		posthogResponse = () =>
			Response.json(
				{ persons_found: 0, persons_deleted: 0, deletion_errors: [] },
				{ status: 202 },
			);

		await purge();
		expect(log).toEqual([
			"posthog.delete",
			"charges.list cus_gone",
			"organization.delete org-solo",
			"tombstone",
		]);
	});

	test("a PostHog failure stops the purge before Stripe or the database", async () => {
		organizations = [
			{ id: "org-solo", memberIds: [USER_ID], stripeCustomerId: "cus_solo" },
		];
		customers.set("cus_solo", {
			deleted: false,
			activeSubscriptionIds: ["sub_solo"],
			charges: [],
		});
		posthogResponse = () =>
			new Response('{"detail":"missing scope person:write"}', { status: 403 });

		await expect(purge()).rejects.toThrow("PostHog person deletion error: 403");
		expect(log).toEqual(["posthog.delete"]);
	});

	test("a Stripe error other than a missing customer leaves the user untombstoned", async () => {
		organizations = [
			{ id: "org-solo", memberIds: [USER_ID], stripeCustomerId: "cus_solo" },
		];
		customers.set("cus_solo", {
			deleted: false,
			activeSubscriptionIds: [],
			charges: [],
		});
		failCustomerDelete = Object.assign(new Error("rate limited"), {
			code: "rate_limit",
		});

		await expect(purge()).rejects.toThrow("rate limited");
		expect(log).toEqual(["posthog.delete", "charges.list cus_solo"]);
	});
});
