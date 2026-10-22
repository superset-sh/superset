import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { getRoleLevel, type OrganizationRole } from "@superset/shared/auth";
import { eq } from "drizzle-orm";
import { githubUserTokenFor } from "../github-user";
import { memberRole } from "./access";
import { appInstallationToken } from "./github";

export interface SourceCredential {
	as: "admin" | "app";
	token(): Promise<string>;
}

export interface CredentialDeps {
	memberRole(userId: string, organizationId: string): Promise<string | null>;
	userToken(userId: string): Promise<string | null>;
	installationId(organizationId: string): Promise<string | null>;
	appToken(installationId: string, repo: string): Promise<string>;
}

const defaultDeps: CredentialDeps = {
	memberRole,
	userToken: githubUserTokenFor,
	async installationId(organizationId) {
		const installation = await db.query.githubInstallations.findFirst({
			where: eq(githubInstallations.organizationId, organizationId),
		});
		return installation && !installation.suspended
			? installation.installationId
			: null;
	},
	appToken: appInstallationToken,
};

function isAdmin(role: string | null): boolean {
	return (
		role !== null &&
		getRoleLevel(role as OrganizationRole) >= getRoleLevel("admin")
	);
}

/**
 * What a sync may read a source's repository with, in order: the GitHub
 * account of the admin who added it, while they are still an admin with it
 * connected, then the organization's GitHub App, so a source outlives them.
 */
export async function sourceCredentials(
	source: {
		organizationId: string;
		repo: string;
		addedByUserId: string | null;
	},
	deps: CredentialDeps = defaultDeps,
): Promise<SourceCredential[]> {
	const credentials: SourceCredential[] = [];
	if (
		source.addedByUserId &&
		isAdmin(await deps.memberRole(source.addedByUserId, source.organizationId))
	) {
		const token = await deps.userToken(source.addedByUserId);
		if (token) credentials.push({ as: "admin", token: async () => token });
	}
	const installationId = await deps.installationId(source.organizationId);
	if (installationId) {
		credentials.push({
			as: "app",
			token: () => deps.appToken(installationId, source.repo),
		});
	}
	return credentials;
}
