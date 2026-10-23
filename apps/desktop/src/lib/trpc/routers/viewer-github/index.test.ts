import { describe, expect, test } from "bun:test";
import type { Octokit } from "@octokit/core";
import { createViewerGithubRouter } from ".";

function caller(token: string | null, octokit: Partial<Octokit> = {}) {
	const tokensUsed: string[] = [];
	const router = createViewerGithubRouter(
		{ getToken: async () => token },
		(used) => {
			tokensUsed.push(used);
			return octokit as Octokit;
		},
	);
	return { tokensUsed, call: router.createCaller({} as never) };
}

describe("viewer GitHub on this machine", () => {
	test("without a local login, says so instead of borrowing anyone's", async () => {
		const { call } = caller(null);
		expect(await call.status()).toEqual({ available: false });
		await expect(
			call.setPullRequestState({
				repoFullName: "acme/widgets",
				number: 7,
				state: "closed",
			}),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("acts with the local token and passes GitHub's refusal on as its code", async () => {
		const { call, tokensUsed } = caller("local-token", {
			request: (async () => {
				throw Object.assign(new Error("Pull Request is not mergeable"), {
					status: 405,
				});
			}) as unknown as Octokit["request"],
		});
		await expect(
			call.mergePullRequest({
				repoFullName: "acme/widgets",
				number: 7,
				mergeMethod: "squash",
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "Pull Request is not mergeable",
		});
		expect(tokensUsed).toEqual(["local-token"]);
	});
});
