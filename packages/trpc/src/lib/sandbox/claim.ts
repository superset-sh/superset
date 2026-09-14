/**
 * Everything the box needs to be one workspace, assembled in one place so a
 * create, a wake and a restart after promote all hand the box the same thing:
 * its identity file, the credential rules for the firewall, the managed
 * environment to push after boot, and the host secret for the boot command.
 */
import type { cloudWorkspaces } from "@superset/db/schema";
import {
	type CloudAgentLaunch,
	cloudAgentLaunchToEnv,
} from "@superset/shared/cloud-agent-launch";
import {
	SANDBOX_CONTRACT_VERSION,
	type SandboxIdentity,
	type SandboxRepository,
} from "@superset/shared/sandbox-contract";
import { env } from "../../env";
import { resolveAgentCredentialEnv } from "../../router/agent-credential";
import { resolveEnvironment } from "../../router/environment/resolve-environment";
import { sandboxHostSecretFor } from "./access";
import { deriveSandboxCredentials } from "./credentials";
import { mergeHooks, readRepoHooks } from "./repo-hooks";
import {
	installationTokenFor,
	toSandboxRepositories,
	workspaceRepositories,
} from "./repositories";
import type { SandboxClaim, SandboxEnvironment } from "./vercel";

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

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
	});
	const token = await installationTokenFor(
		checkouts.map((entry) => entry.repository),
	);
	const hooksCheckout = checkouts.find((entry) => entry.hooks) ?? checkouts[0];
	const repoHooks =
		args.withRepoHooks && hooksCheckout
			? await readRepoHooks({
					repo: hooksCheckout.repository,
					branch: hooksCheckout.branch,
					token,
				})
			: null;
	const hooks = mergeHooks(repoHooks, environment.hooks);
	// The box acts on start and ports; setup is the release's, and can be a
	// whole script, which has no place in the identity file.
	const boxHooks =
		environment.hooks?.start || environment.hooks?.ports
			? { start: environment.hooks.start, ports: environment.hooks.ports }
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
		...(boxHooks ? { SUPERSET_SANDBOX_HOOKS: JSON.stringify(boxHooks) } : {}),
		...(env.SENTRY_DSN_SANDBOX
			? {
					HOST_SERVICE_SENTRY_DSN: env.SENTRY_DSN_SANDBOX,
					HOST_SERVICE_SENTRY_ENVIRONMENT:
						env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
				}
			: {}),
		...(cloudAgentLaunchToEnv(args.launch) as Partial<SandboxIdentity>),
	};
	const { networkPolicy, managedEnv } = deriveSandboxCredentials({
		environmentEnv: environment.envs,
		userAgentEnv,
		githubToken: token,
	});
	return {
		claim: {
			identity,
			hostSecret: await sandboxHostSecretFor(args.row.id),
			managedEnv,
			networkPolicy,
			ports: hooks.ports,
		},
		environment: {
			sourceKind: environment.sourceKind,
			sourceRef: environment.sourceRef,
		},
		repositories,
	};
}
