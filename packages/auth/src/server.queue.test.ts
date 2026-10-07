import { afterEach, expect, mock, spyOn, test } from "bun:test";

const original = {
	flag: process.env.SELF_HOST_QUEUE,
	url: process.env.SELF_HOST_QUEUE_URL,
	secret: process.env.SELF_HOST_QUEUE_SECRET,
	nodeEnv: process.env.NODE_ENV,
};
process.env.SELF_HOST_QUEUE = "1";
process.env.SELF_HOST_QUEUE_URL = "http://127.0.0.1:8789";
process.env.SELF_HOST_QUEUE_SECRET = "owned-auth-hook-queue-secret-0123456789";
mock.module(
	new URL("../../email/src/lib/env.ts", import.meta.url).pathname,
	() => ({
		env: { NEXT_PUBLIC_MARKETING_URL: "https://marketing.example.test" },
	}),
);
mock.module("./env", () => ({
	env: {
		NEXT_PUBLIC_API_URL: "https://api.example.test",
		NEXT_PUBLIC_COOKIE_DOMAIN: "example.test",
	},
}));
const customerCreates: unknown[] = [];
const organizationUpdates: unknown[] = [];
const seededOrganizations: string[] = [];
const stripeCalls: string[] = [];
let activeSubscription: { plan: string; stripeSubscriptionId: string } | null =
	{ plan: "pro", stripeSubscriptionId: "sub_retained_fixture" };
mock.module("@superset/db/seed-default-statuses", () => ({
	seedDefaultStatuses: async (organizationId: string) => {
		seededOrganizations.push(organizationId);
	},
}));
mock.module("@superset/db/client", () => ({
	db: {
		select: () => ({ from: () => ({ where: async () => [{ count: 2 }] }) }),
		update: () => ({
			set: (value: unknown) => ({
				where: async () => {
					organizationUpdates.push(value);
				},
			}),
		}),
		query: {
			teams: { findFirst: async () => null },
			invitations: { findFirst: async () => null },
			subscriptions: { findFirst: async () => activeSubscription },
			organizations: {
				findFirst: async () => ({
					name: "Owned",
					stripeCustomerId: "owned-customer",
				}),
			},
		},
	},
	dbWs: {},
}));
mock.module("better-auth", () => ({ betterAuth: () => ({}) }));
mock.module("better-auth/adapters/drizzle", () => ({
	drizzleAdapter: () => ({}),
}));
mock.module("better-auth/api", () => ({
	APIError: Error,
	createAuthMiddleware: (fn: unknown) => fn,
	getSessionFromCtx: async () => null,
}));
type OrganizationCreatedArgs = {
	organization: { id: string; name: string };
	user: { email: string };
};
let organizationCreated:
	| ((args: OrganizationCreatedArgs) => Promise<void>)
	| undefined;
const organizationHooks: Record<
	string,
	(args: typeof organizationArgs) => Promise<void>
> = {};
mock.module("better-auth/plugins", () => ({
	bearer: () => ({}),
	customSession: () => ({}),
	oneTimeToken: () => ({}),
	organization: (options: {
		organizationHooks: {
			afterCreateOrganization: (args: OrganizationCreatedArgs) => Promise<void>;
		};
	}) => {
		organizationCreated = options.organizationHooks.afterCreateOrganization;
		Object.assign(organizationHooks, options.organizationHooks);
		return {};
	},
}));
mock.module("better-auth/plugins/generic-oauth", () => ({
	genericOAuth: () => ({}),
}));
mock.module("better-auth/plugins/jwt", () => ({ jwt: () => ({}) }));
mock.module("@better-auth/api-key", () => ({ apiKey: () => ({}) }));
mock.module("@better-auth/expo", () => ({ expo: () => ({}) }));
mock.module("@better-auth/oauth-provider", () => ({
	oauthProvider: () => ({}),
}));
type HookArgs = {
	subscription: { referenceId: string; plan: string };
	stripeSubscription: {
		id: string;
		canceled_at: null;
		cancellation_details?: {
			comment: string | null;
			feedback: string | null;
			reason: string | null;
		};
	};
	cancellationDetails?: {
		comment: string | null;
		feedback: string | null;
		reason: string | null;
	};
};
let cancel: ((args: HookArgs) => Promise<void>) | undefined;
mock.module("@better-auth/stripe", () => ({
	stripe: (options: {
		subscription: { onSubscriptionCancel: (args: HookArgs) => Promise<void> };
	}) => {
		cancel = options.subscription.onSubscriptionCancel;
		return {};
	},
}));
const stripeClient = {
	subscriptions: {
		list: async () => {
			stripeCalls.push("list");
			return { data: [] };
		},
		cancel: async () => {
			stripeCalls.push("cancel");
		},
		retrieve: async () => {
			stripeCalls.push("retrieve");
			throw Error("Unexpected Stripe read");
		},
		update: async () => {
			stripeCalls.push("subscription-update");
		},
	},
	customers: {
		update: async () => {
			stripeCalls.push("customer-update");
		},
		create: async (input: unknown) => {
			customerCreates.push(input);
			return { id: "owned-new-customer" };
		},
	},
};
function configureBilling(key: string | undefined) {
	mock.module("./stripe", () => ({
		isBillingEnabled: Boolean(key),
		stripeClient,
	}));
}
configureBilling(undefined);
mock.module("./utils", () => ({
	countBillableSeats: async () => 1,
	formatPrice: () => "owned",
	getOrganizationBillingRecipients: async () => [],
	getOrganizationOwners: async () => [],
}));
mock.module("./utils/invoice-preview", () => ({
	previewNextInvoice: async () => null,
}));
mock.module("./lib/accept-invitation-endpoint", () => ({
	acceptInvitationEndpoint: {},
}));
mock.module("./lib/billing-analytics", () => ({
	captureBillingEvent: async () => {},
}));
mock.module("./lib/lifecycle", () => ({
	getActivationVariant: async () => "test",
}));
mock.module("./lib/rate-limit", () => ({ invitationRateLimit: {} }));
mock.module("./lib/resend", () => ({
	resend: {
		batch: { send: async () => ({}) },
		emails: { send: async () => ({}) },
		trackLifecycle: async () => {},
	},
}));
await import("./server");
afterEach(() => {
	configureBilling(undefined);
	stripeCalls.length = 0;
	customerCreates.length =
		organizationUpdates.length =
		seededOrganizations.length =
			0;
	for (const [name, value] of Object.entries({
		SELF_HOST_QUEUE: original.flag,
		SELF_HOST_QUEUE_URL: original.url,
		SELF_HOST_QUEUE_SECRET: original.secret,
		NODE_ENV: original.nodeEnv,
	})) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});
test.each([
	undefined,
	{
		comment: null,
		feedback: "too_expensive",
		reason: "cancellation_requested",
	},
])("actual subscription cancellation hook preserves the JSON wire body with optional details: %j", async (details) => {
	process.env.SELF_HOST_QUEUE = "1";
	process.env.SELF_HOST_QUEUE_URL = "http://127.0.0.1:8789";
	process.env.SELF_HOST_QUEUE_SECRET =
		"owned-auth-hook-queue-secret-0123456789";
	const publications: unknown[] = [];
	const network = spyOn(globalThis, "fetch").mockImplementation(
		async (_input, init) => {
			publications.push(JSON.parse(String(init?.body)));
			return Response.json({ messageId: "stored" }, { status: 202 });
		},
	);
	const logging = spyOn(console, "error").mockImplementation(() => {});
	try {
		expect(cancel).toBeDefined();
		if (!cancel) throw Error("Missing actual cancellation hook");
		await cancel({
			subscription: { referenceId: "owned-org", plan: "enterprise" },
			stripeSubscription: { id: "owned-subscription", canceled_at: null },
			cancellationDetails: details,
		});
		expect(publications).toEqual([
			{
				url: "https://api.example.test/api/integrations/stripe/jobs/notify-slack",
				body: {
					eventType: "subscription_cancelled",
					stripeSubscriptionId: "owned-subscription",
					...(details ? { cancellationDetails: details } : {}),
				},
				retries: 3,
				delay: 120,
			},
		]);
		expect(logging).not.toHaveBeenCalled();
	} finally {
		network.mockRestore();
		logging.mockRestore();
	}
});

const organizationArgs = {
	organization: { id: "owned-org", name: "Owned Organization" },
	user: { email: "owner@example.test" },
};
for (const key of [undefined, ""]) {
	test(`actual production organization hook skips Stripe with ${key === undefined ? "missing" : "empty"} billing credentials`, async () => {
		process.env.NODE_ENV = "production";
		configureBilling(key);
		if (!organizationCreated)
			throw new Error("Missing actual organization hook");
		await organizationCreated(organizationArgs);
		expect(customerCreates).toEqual([]);
		expect(organizationUpdates).toEqual([]);
		expect(seededOrganizations).toEqual(["owned-org"]);
	});
}

test("configured production billing still creates and records its Stripe customer", async () => {
	process.env.NODE_ENV = "production";
	configureBilling("sk_test_owned_fixture");
	if (!organizationCreated) throw new Error("Missing actual organization hook");
	await organizationCreated(organizationArgs);
	expect(customerCreates).toEqual([
		{
			name: "Owned Organization",
			email: "owner@example.test",
			metadata: { organizationId: "owned-org" },
		},
	]);
	expect(organizationUpdates).toEqual([
		{ stripeCustomerId: "owned-new-customer" },
	]);
	expect(seededOrganizations).toEqual(["owned-org"]);
});

test("configured development billing retains the customer-creation exemption", async () => {
	process.env.NODE_ENV = "development";
	configureBilling("sk_test_owned_fixture");
	if (!organizationCreated) throw new Error("Missing actual organization hook");
	await organizationCreated(organizationArgs);
	expect(customerCreates).toEqual([]);
	expect(organizationUpdates).toEqual([]);
	expect(seededOrganizations).toEqual(["owned-org"]);
});

test("disabled billing keeps retained-customer organization lifecycle and membership independent of Stripe", async () => {
	configureBilling(undefined);
	const retained = {
		...organizationArgs,
		member: { userId: "owned-user", role: "member" },
		organization: {
			...organizationArgs.organization,
			stripeCustomerId: "cus_retained_fixture",
		},
	};
	await organizationHooks.beforeDeleteOrganization?.(retained);
	await organizationHooks.afterUpdateOrganization?.(retained);
	activeSubscription = null;
	await organizationHooks.beforeAddMember?.(retained);
	activeSubscription = {
		plan: "pro",
		stripeSubscriptionId: "sub_retained_fixture",
	};
	await organizationHooks.afterAddMember?.(retained);
	await organizationHooks.afterRemoveMember?.(retained);
	expect(customerCreates).toEqual([]);
	expect(stripeCalls).toEqual([]);
});

test("configured retained-customer lifecycle still reconciles with Stripe", async () => {
	configureBilling("sk_test_owned_fixture");
	const retained = {
		...organizationArgs,
		organization: {
			...organizationArgs.organization,
			stripeCustomerId: "cus_retained_fixture",
		},
	};
	await organizationHooks.beforeDeleteOrganization?.(retained);
	await organizationHooks.afterUpdateOrganization?.(retained);
	expect(stripeCalls).toEqual(["list", "customer-update"]);
});
