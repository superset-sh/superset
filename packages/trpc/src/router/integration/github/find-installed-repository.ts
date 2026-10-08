import { db } from "@superset/db/client";
import { githubInstallations, githubRepositories } from "@superset/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { userError } from "../../../trpc";

export async function findInstalledRepository(
	organizationId: string,
	repoFullName: string,
) {
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.organizationId, organizationId),
	});
	if (!installation)
		throw userError({
			code: "PRECONDITION_FAILED",
			message: "GitHub installation not found",
			i18nKey: "serverError.integration.githubInstallationNotFound",
		});
	const repo = await db.query.githubRepositories.findFirst({
		where: and(
			eq(githubRepositories.installationId, installation.id),
			sql`lower(${githubRepositories.fullName}) = ${repoFullName.toLowerCase()}`,
		),
		columns: { id: true, fullName: true },
	});
	if (!repo)
		throw userError({
			code: "NOT_FOUND",
			message: `${repoFullName} is not a repository the GitHub App is installed on`,
			i18nKey: "serverError.integration.repositoryNotInstalled",
			params: { repoFullName },
		});
	return { installation, repo };
}
