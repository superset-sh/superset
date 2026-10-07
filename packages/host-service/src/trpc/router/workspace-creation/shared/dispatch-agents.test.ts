import { expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../../types";
import type { ExpectedGitlabBoundDelivery } from "../../workspaces/create-gitlab-checkout";
import { dispatchSugarAgents } from "./dispatch-agents";

const ctx = {} as HostServiceContext;
const bound = {
	expectedPullRequest: { provider: "gitlab" },
} as ExpectedGitlabBoundDelivery;
test("bound startup failure returns the created workspace agent result", async () => {
	const run = async () => {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "fixture startup failed",
		});
	};
	expect(
		await dispatchSugarAgents(
			ctx,
			"created",
			[{ agent: "fixture", prompt: "hello" }],
			bound,
			run,
		),
	).toEqual([{ ok: false, error: "fixture startup failed" }]);
});
test("bound identity and delivery refusal fail closed", async () => {
	for (const error of [
		new TRPCError({ code: "BAD_REQUEST", message: "wrong MR" }),
		new TRPCError({
			code: "NOT_FOUND",
			message: "delivery refused",
			cause: { deliveryRefused: true },
		}),
	])
		await expect(
			dispatchSugarAgents(
				ctx,
				"created",
				[{ agent: "fixture", prompt: "hello" }],
				bound,
				async () => {
					throw error;
				},
			),
		).rejects.toBe(error);
});
