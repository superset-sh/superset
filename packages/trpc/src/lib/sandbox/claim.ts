/**
 * Everything the box needs to be one workspace, assembled in one place so a
 * create, a wake and a restart after promote all hand the box the same thing:
 * its identity file, the credential rules for the firewall, the managed
 * environment to push after boot, and the host secret for the boot command.
 */
import { db } from "@superset/db/client";
import { type cloudWorkspaces, users } from "@superset/db/schema";
import {
	type CloudAgentLaunch,
	cloudAgentLaunchToEnv,
} from "@superset/shared/cloud-agent-launch";
import {
	SANDBOX_CONTRACT_VERSION,
	type SandboxIdentity,
	type SandboxRepository,
} from "@superset/shared/sandbox-contract";
import { eq } from "drizzle-orm";
import { env } from "../../env";
import { resolveAgentCredentialEnv } from "../../router/agent-credential";
import { resolveEnvironment } from "../../router/environment/resolve-environment";
import { githubUserConnectionFor, githubUserTokenFor } from "../github-user";
import { sandboxHostSecretFor } from "./access";
import { deriveSandboxCredentials, gitAuthorFor } from "./credentials";
import { readRepoHooks } from "./repo-hooks";
import {
	installationTokenFor,
	toSandboxRepositories,
	workspaceRepositories,
} from "./repositories";
import type { SandboxClaim, SandboxEnvironment } from "./vercel";

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

/** Commits by a workspace nobody created, such as an automation's. */
const SUPERSET_GIT_AUTHOR = { name: "Superset", email: "noreply@superset.sh" };

export async function buildSandboxClaim(args: {
	row: CloudWorkspaceRow;
	launch?: CloudAgentLaunch;
	/**
	 * Read the repository's own hooks too. Only a create needs them (ports
	 * are fixed once the box exists), and it costs a GitHub request.
	 */
	withRepoHooks?: boolean;
}): Promise<{
	claim: SandboxClaim;
	environment: SandboxEnvironment;
	repositories: SandboxRepository[];
}> {
	const [environment, userAgentEnv] = await Promise.all([
		resolveEnvironment(args.row.environmentId, args.row.organizationId),
		args.row.createdByUserId
			? resolveAgentCredentialEnv({ userId: args.row.createdByUserId })
			: Promise.resolve({}),
	]);
	if (!environment) throw new Error("Environment not found");
	const checkouts = await workspaceRepositories({
		cloudWorkspaceId: args.row.id,
		hooksRepositoryId: environment.hooksRepositoryId,
		primaryBranch: args.row.baseBranch,
		workingBranch: args.row.branch,
	});
	const creator = args.row.createdByUserId;
	const [userToken, githubAccount, creatorUser] = creator
		? await Promise.all([
				githubUserTokenFor(creator),
				githubUserConnectionFor(creator),
				db.query.users.findFirst({
					where: eq(users.id, creator),
					columns: { name: true, email: true },
				}),
			])
		: [null, null, undefined];
	// The creator's own token when they have connected GitHub: pushes and pull
	// requests are theirs. The App's installation token otherwise.
	const token =
		userToken ??
		(await installationTokenFor(checkouts.map((entry) => entry.repository)));
	const hooksCheckout = checkouts.find((entry) => entry.hooks) ?? checkouts[0];
	const repoHooks =
		args.withRepoHooks && hooksCheckout
			? await readRepoHooks({
					repo: hooksCheckout.repository,
					branch: hooksCheckout.baseBranch,
					token,
				})
			: null;
	const repositories = toSandboxRepositories(checkouts);

	const identity: SandboxIdentity = {
		SUPERSET_SANDBOX_CONTRACT: String(SANDBOX_CONTRACT_VERSION) as "1",
		SUPERSET_API_URL: env.NEXT_PUBLIC_API_URL,
		SUPERSET_SANDBOX_WORKSPACE_ID: args.row.id,
		SUPERSET_SANDBOX_ORGANIZATION_ID: args.row.organizationId,
		SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify(repositories),
		SUPERSET_SANDBOX_IMAGE_TAG: environment.sourceRef,
		SUPERSET_SANDBOX_PROVIDER: args.row.provider,
		...(environment.bundleSha
			? { SUPERSET_BUNDLE_SHA: environment.bundleSha }
			: {}),
		...(env.SENTRY_DSN_SANDBOX
			? {
					HOST_SERVICE_SENTRY_DSN: env.SENTRY_DSN_SANDBOX,
					HOST_SERVICE_SENTRY_ENVIRONMENT:
						env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
				}
			: {}),
		...(cloudAgentLaunchToEnv(args.launch) as Partial<SandboxIdentity>),
	};
	const { networkPolicy, managedEnv } = await deriveSandboxCredentials({
		workspaceId: args.row.id,
		environmentEnv: environment.envs,
		userAgentEnv,
		githubToken: token,
		gitAuthor: gitAuthorFor({
			github: githubAccount
				? {
						id: githubAccount.githubUserId,
						login: githubAccount.login,
						name: githubAccount.name,
					}
				: null,
			user: creatorUser ?? SUPERSET_GIT_AUTHOR,
		}),
	});
	return {
		claim: {
			identity,
			hostSecret: await sandboxHostSecretFor(args.row.id),
			managedEnv,
			networkPolicy,
			ports: repoHooks?.ports,
		},
		environment: {
			sourceKind: environment.sourceKind,
			sourceRef: environment.sourceRef,
		},
		repositories,
	};
}
