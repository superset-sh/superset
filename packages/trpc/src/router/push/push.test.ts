import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as expoPush from "../../lib/expo-push/expo-push";

let sent: Parameters<typeof expoPush.sendExpoPush>[0] = [];
let deleted = 0;

stub(db.query.pushDevices, {
	findMany: async () => [{ token: "t-live" }, { token: "t-dead" }],
});
stub(db, {
	delete: () => ({
		where: async () => {
			deleted += 1;
		},
	}),
});
stub(expoPush, {
	sendExpoPush: async (messages: typeof sent) => {
		sent = messages;
		return ["t-dead"];
	},
});

const { pushRouter } = await import("./push");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const callerFor = (sandbox: boolean) =>
	createCallerFactory(createTRPCRouter({ push: pushRouter }))(
		createTRPCContext({
			session: {
				user: { id: "u1", email: "u1@example.com" },
				session: { activeOrganizationId: "org" },
			} as never,
			auth: {} as never,
			headers: new Headers(),
			sandboxCaller: sandbox
				? { workspaceId: "w1", organizationId: "org", userId: "u1" }
				: null,
		}),
	);

describe("push.notifyAgentEvent", () => {
	test("sends to every device of the caller and drops the dead ones", async () => {
		const result = await callerFor(true).push.notifyAgentEvent({
			event: "stop",
			workspaceId: "w1",
			terminalId: "t1",
			workspaceName: "my-workspace",
			preview: "  Done.\n\nAll tests pass.  ",
		});

		expect(result).toEqual({ sent: 1 });
		expect(sent.map((message) => message.to)).toEqual(["t-live", "t-dead"]);
		expect(sent[0]).toMatchObject({
			title: "my-workspace",
			body: "Done. All tests pass.",
			data: { event: "stop", workspaceId: "w1", terminalId: "t1" },
		});
		expect(deleted).toBe(1);
	});

	test("a cloud workspace cannot register a device", async () => {
		await expect(
			callerFor(true).push.registerDevice({
				token: "ExponentPushToken[abc]",
				platform: "ios",
			}),
		).rejects.toThrow(/cannot call push.registerDevice/);
	});
});
