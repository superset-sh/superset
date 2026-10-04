import { db } from "@superset/db/client";
import { githubInstallations, githubRepositories } from "@superset/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { installationOctokit } from "../../../lib/sandbox/clone-token";
import { protectedProcedure, userError } from "../../../trpc";
import { verifyOrgMembership } from "../utils";

export const getPullRequestDiff = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
			number: z.number().int().positive(),
		}),
	)
	.query(async ({ ctx, input }) => {
		await verifyOrgMembership(ctx.session.user.id, input.organizationId);
		const installation = await db.query.githubInstallations.findFirst({
			where: eq(githubInstallations.organizationId, input.organizationId),
		});
		if (!installation) {
			throw userError({
				code: "PRECONDITION_FAILED",
				message: "GitHub installation not found",
				i18nKey: "serverError.integration.githubInstallationNotFound",
			});
		}
		const repo = await db.query.githubRepositories.findFirst({
			where: and(
				eq(githubRepositories.installationId, installation.id),
				sql`lower(${githubRepositories.fullName}) = ${input.repoFullName.toLowerCase()}`,
			),
			columns: { fullName: true },
		});
		if (!repo) {
			throw userError({
				code: "NOT_FOUND",
				message: `${input.repoFullName} is not a repository the GitHub App is installed on`,
				i18nKey: "serverError.integration.repositoryNotInstalled",
				params: { repoFullName: input.repoFullName },
			});
		}
		const [owner, name] = repo.fullName.split("/");
		const octokit = await installationOctokit(installation.installationId);
		const { data } = await octokit.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}",
			{
				owner: owner ?? "",
				repo: name ?? "",
				pull_number: input.number,
				headers: { accept: "application/vnd.github.diff" },
			},
		);
		if (typeof data !== "string") {
			throw new Error("GitHub did not return a pull request diff");
		}
		return { patch: data };
	});
