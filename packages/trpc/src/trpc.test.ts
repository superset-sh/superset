import { describe, expect, mock, test } from "bun:test";
import type { TRPCError } from "@trpc/server";

const CREATOR_ORGS = ["box-org", "other-org"];

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			members: {
				findMany: async () =>
					CREATOR_ORGS.map((organizationId) => ({ organizationId })),
				findFirst: async () => ({ id: "membership" }),
			},
		},
	},
	dbWs: {},
}));
mock.module("./lib/analytics", () => ({
	posthog: { capture: () => {}, isFeatureEnabled: async () => false },
}));

const {
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
	jwtProcedure,
	protectedProcedure,
} = await import("./trpc");

const reached = jwtProcedure.mutation(() => "reached");

const router = createTRPCRouter({
	cloudWorkspace: createTRPCRouter({
		list: jwtProcedure.query(({ ctx }) => ctx.organizationIds),
		delete: reached,
		rename: reached,
		setDescription: reached,
		sleep: reached,
		unarchive: reached,
		setVisibility: reached,
		restart: reached,
	}),
	user: createTRPCRouter({
		myOrganization: protectedProcedure.query(
			({ ctx }) => ctx.activeOrganizationId,
		),
	}),
});

const BOX = {
	workspaceId: "box",
	organizationId: "box-org",
	userId: "creator",
};

const session = {
	user: { id: "creator", email: "creator@example.com" },
	session: { activeOrganizationId: "box-org" },
};

const callerFor = ({
	sandboxCaller = BOX as typeof BOX | null,
	bearer = false,
	organization,
}: {
	sandboxCaller?: typeof BOX | null;
	bearer?: boolean;
	organization?: string;
} = {}) => {
	const headers = new Headers();
	if (bearer) headers.set("authorization", "Bearer token");
	if (organization) headers.set("x-superset-organization-id", organization);
	return createCallerFactory(router)(
		createTRPCContext({
			session: session as never,
			auth: {
				api: {
					verifyJWT: async () => ({
						payload: { sub: "creator", organizationIds: CREATOR_ORGS },
					}),
				},
			} as never,
			headers,
			sandboxCaller,
		}),
	);
};

const outcome = async (call: () => Promise<unknown>) => {
	try {
		return await call();
	} catch (error) {
		return (error as TRPCError).code;
	}
};

describe("what a cloud workspace may call", () => {
	const box = callerFor();

	test.each([
		["delete", () => box.cloudWorkspace.delete()],
		["rename", () => box.cloudWorkspace.rename()],
		["setDescription", () => box.cloudWorkspace.setDescription()],
		["sleep", () => box.cloudWorkspace.sleep()],
	])("a box reaches cloudWorkspace.%s", async (_name, call) => {
		expect(await outcome(call)).toBe("reached");
	});

	test.each([
		["unarchive", () => box.cloudWorkspace.unarchive()],
		["setVisibility", () => box.cloudWorkspace.setVisibility()],
		["restart", () => box.cloudWorkspace.restart()],
	])("a box is refused cloudWorkspace.%s", async (_name, call) => {
		expect(await outcome(call)).toBe("FORBIDDEN");
	});

	test("a signed-in client is not narrowed", async () => {
		const client = callerFor({ sandboxCaller: null });
		expect(await outcome(() => client.cloudWorkspace.setVisibility())).toBe(
			"reached",
		);
	});
});

describe("the organization a cloud workspace acts in", () => {
	test.each([
		["its session", false],
		["a bearer", true],
	])("a box sees only its own organization through %s", async (_name, bearer) => {
		const box = callerFor({ bearer });
		expect(await box.cloudWorkspace.list()).toEqual(["box-org"]);
	});

	test.each([
		[
			"jwtProcedure",
			() => callerFor({ organization: "other-org" }).cloudWorkspace.list(),
		],
		[
			"protectedProcedure",
			() => callerFor({ organization: "other-org" }).user.myOrganization(),
		],
	])("%s refuses a box another of its creator's organizations", async (_name, call) => {
		expect(await outcome(call)).toBe("FORBIDDEN");
	});

	test("a box may name its own organization", async () => {
		const box = callerFor({ organization: "box-org" });
		expect(await box.user.myOrganization()).toBe("box-org");
		expect(await box.cloudWorkspace.list()).toEqual(["box-org"]);
	});

	test("a signed-in client keeps every organization it belongs to", async () => {
		const client = callerFor({
			sandboxCaller: null,
			organization: "other-org",
		});
		expect(await client.cloudWorkspace.list()).toEqual(CREATOR_ORGS);
		expect(await client.user.myOrganization()).toBe("other-org");
	});
});
