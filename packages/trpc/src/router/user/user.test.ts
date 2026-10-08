import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as activationEvents from "../../lib/activation-events";
import { posthog } from "../../lib/analytics";

const membership = (organizationId: string) => ({
	organizationId,
	organization: { id: organizationId },
});

stub(db.query.members, {
	findMany: async () => [membership("box-org"), membership("other-org")],
});
stub(posthog, { capture: () => {}, isFeatureEnabled: async () => false });
stub(activationEvents, { emitAppFirstOpened: async () => {} });

const { userRouter } = await import("./user");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const callerFor = (
	sandboxCaller: {
		workspaceId: string;
		organizationId: string;
		userId: string;
	} | null,
) =>
	createCallerFactory(createTRPCRouter({ user: userRouter }))(
		createTRPCContext({
			session: {
				user: { id: "creator", email: "creator@example.com" },
				session: { activeOrganizationId: "box-org" },
			} as never,
			auth: {} as never,
			headers: new Headers(),
			sandboxCaller,
		}),
	);

describe("user.myOrganizations", () => {
	test("lists only a box's own organization", async () => {
		const box = callerFor({
			workspaceId: "box",
			organizationId: "box-org",
			userId: "creator",
		});
		expect(await box.user.myOrganizations()).toEqual([{ id: "box-org" }]);
	});

	test("lists every organization for a signed-in client", async () => {
		expect(await callerFor(null).user.myOrganizations()).toEqual([
			{ id: "box-org" },
			{ id: "other-org" },
		]);
	});
});
