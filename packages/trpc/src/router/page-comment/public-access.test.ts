import { describe, expect, test } from "bun:test";
import { db, dbWs } from "@superset/db/client";
import type { TRPCError } from "@trpc/server";
import { stub } from "../../../test/stub";
import { posthog } from "../../lib/analytics";

let dbTouched = false;

const reached = () => {
	dbTouched = true;
	throw new Error("reached the database");
};
const forbidden = {
	query: new Proxy({}, { get: reached }),
	select: reached,
	insert: reached,
	update: reached,
	delete: reached,
	execute: reached,
	transaction: reached,
};

stub(db, forbidden);
stub(dbWs, forbidden);
stub(posthog, { capture: () => {} });

const { pageCommentRouter } = await import("./page-comment");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const router = createTRPCRouter({ pageComment: pageCommentRouter });

const callerFor = (session: unknown) =>
	createCallerFactory(router)(
		createTRPCContext({
			session: session as never,
			auth: {} as never,
			headers: new Headers(),
		}),
	);

const PAGE_ID = "00000000-0000-4000-8000-000000000001";
const THREAD_ID = "00000000-0000-4000-8000-000000000002";
const COMMENT_ID = "00000000-0000-4000-8000-000000000003";

const everyProcedure = (caller: ReturnType<typeof callerFor>) =>
	Object.entries({
		list: () => caller.pageComment.list({ pageId: PAGE_ID }),
		create: () =>
			caller.pageComment.create({
				pageId: PAGE_ID,
				version: 1,
				anchorKind: "page",
				anchor: null,
				anchorText: null,
				body: "rewrite this section",
			}),
		reply: () => caller.pageComment.reply({ threadId: THREAD_ID, body: "ok" }),
		edit: () => caller.pageComment.edit({ commentId: COMMENT_ID, body: "ok" }),
		resolve: () =>
			caller.pageComment.resolve({ threadId: THREAD_ID, resolved: true }),
		delete: () => caller.pageComment.delete({ threadId: THREAD_ID }),
	});

const codeOf = async (call: () => Promise<unknown>) => {
	try {
		await call();
		return "resolved";
	} catch (error) {
		return (error as TRPCError).code;
	}
};

describe("page comments, from outside an organization", () => {
	test.each(
		everyProcedure(callerFor(null)),
	)("%s turns away a reader with no session", async (_name, call) => {
		dbTouched = false;
		expect(await codeOf(call)).toBe("UNAUTHORIZED");
		expect(dbTouched).toBe(false);
	});

	test.each(
		everyProcedure(
			callerFor({
				user: {
					id: "reader",
					email: "reader@example.com",
					deletionRequestedAt: null,
				},
				session: { activeOrganizationId: null },
			}),
		),
	)("%s turns away a signed-in reader with no active org", async (_name, call) => {
		dbTouched = false;
		expect(await codeOf(call)).toBe("FORBIDDEN");
		expect(dbTouched).toBe(false);
	});
});
