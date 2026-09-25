import { describe, expect, it } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../types";
import { gitRouter } from "./git";

interface ReplyCall {
	owner: string;
	repo: string;
	pull_number: number;
	comment_id: number;
	body: string;
}

function createCaller(opts: {
	workspace?: { pullRequestId: string | null };
	pr?: { repoOwner: string; repoName: string; prNumber: number };
	/** Thrown by the GitHub call instead of returning the new comment. */
	rejection?: unknown;
}) {
	const replyCalls: ReplyCall[] = [];
	const ctx = {
		isAuthenticated: true,
		db: {
			query: {
				workspaces: {
					findFirst: () => ({ sync: () => opts.workspace }),
				},
				pullRequests: {
					findFirst: () => ({ sync: () => opts.pr }),
				},
			},
		},
		github: async () => ({
			pulls: {
				createReplyForReviewComment: async (args: ReplyCall) => {
					replyCalls.push(args);
					if (opts.rejection !== undefined) throw opts.rejection;
					return { data: { id: 9001 } };
				},
			},
		}),
	} as unknown as HostServiceContext;
	return { caller: gitRouter.createCaller(ctx), replyCalls };
}

const LINKED = {
	workspace: { pullRequestId: "pr-1" },
	pr: { repoOwner: "acme", repoName: "widgets", prNumber: 17 },
};

async function expectTrpcError(
	promise: Promise<unknown>,
	code: TRPCError["code"],
) {
	try {
		await promise;
		throw new Error("expected the call to reject");
	} catch (error) {
		expect(error).toBeInstanceOf(TRPCError);
		expect((error as TRPCError).code).toBe(code);
	}
}

describe("gitRouter.replyToReviewThread", () => {
	it("threads the reply onto the comment in the workspace's PR", async () => {
		const { caller, replyCalls } = createCaller(LINKED);

		const result = await caller.replyToReviewThread({
			workspaceId: "ws-1",
			commentId: 555,
			body: "  Looks good  ",
		});

		expect(result).toEqual({ id: 9001 });
		expect(replyCalls).toEqual([
			{
				owner: "acme",
				repo: "widgets",
				pull_number: 17,
				comment_id: 555,
				body: "Looks good",
			},
		]);
	});

	it("rejects a blank body before reaching GitHub", async () => {
		const { caller, replyCalls } = createCaller(LINKED);

		await expectTrpcError(
			caller.replyToReviewThread({
				workspaceId: "ws-1",
				commentId: 555,
				body: "   ",
			}),
			"BAD_REQUEST",
		);
		expect(replyCalls).toHaveLength(0);
	});

	it("returns NOT_FOUND when the workspace has no pull request", async () => {
		const { caller, replyCalls } = createCaller({
			workspace: { pullRequestId: null },
		});

		await expectTrpcError(
			caller.replyToReviewThread({
				workspaceId: "ws-1",
				commentId: 555,
				body: "Looks good",
			}),
			"NOT_FOUND",
		);
		expect(replyCalls).toHaveLength(0);
	});

	it("reports a linked pull request missing from the database as a server error", async () => {
		const { caller, replyCalls } = createCaller({
			workspace: { pullRequestId: "pr-1" },
		});

		await expectTrpcError(
			caller.replyToReviewThread({
				workspaceId: "ws-1",
				commentId: 555,
				body: "Looks good",
			}),
			"INTERNAL_SERVER_ERROR",
		);
		expect(replyCalls).toHaveLength(0);
	});

	it("maps GitHub's rejection onto the matching tRPC code", async () => {
		const { caller } = createCaller({
			...LINKED,
			rejection: Object.assign(new Error("Not Found"), { status: 404 }),
		});

		await expectTrpcError(
			caller.replyToReviewThread({
				workspaceId: "ws-1",
				commentId: 555,
				body: "Looks good",
			}),
			"NOT_FOUND",
		);
	});
});
