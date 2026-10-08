import {
	fetchPullRequestFilesDiff,
	isPullRequestDiffTooLarge,
	type PullRequestDiff,
} from "@superset/shared/pull-request-diff";
import { z } from "zod";
import { installationOctokit } from "../../../lib/sandbox/clone-token";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgMembership } from "../utils";
import { findInstalledRepository } from "./find-installed-repository";

export const getPullRequestDiff = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
			number: z.number().int().positive(),
		}),
	)
	.query(async ({ ctx, input }): Promise<PullRequestDiff> => {
		await verifyOrgMembership(ctx.session.user.id, input.organizationId);
		const { installation, repo } = await findInstalledRepository(
			input.organizationId,
			input.repoFullName,
		);
		const [owner, name] = repo.fullName.split("/");
		const octokit = await installationOctokit(installation.installationId);
		const pullRequest = {
			owner: owner ?? "",
			repo: name ?? "",
			pull_number: input.number,
		};
		let data: unknown;
		try {
			const response = await octokit.request(
				"GET /repos/{owner}/{repo}/pulls/{pull_number}",
				{
					...pullRequest,
					headers: { accept: "application/vnd.github.diff" },
				},
			);
			data = response.data;
		} catch (error) {
			if (!isPullRequestDiffTooLarge(error)) throw error;
			return fetchPullRequestFilesDiff({
				readPullRequest: async () =>
					(
						await octokit.request(
							"GET /repos/{owner}/{repo}/pulls/{pull_number}",
							pullRequest,
						)
					).data,
				readFiles: async (page, perPage) =>
					(
						await octokit.request(
							"GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
							{ ...pullRequest, page, per_page: perPage },
						)
					).data,
			});
		}
		if (typeof data !== "string") {
			throw new Error("GitHub did not return a pull request diff");
		}
		return { patch: data };
	});
