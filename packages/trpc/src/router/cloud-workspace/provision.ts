import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import {
	type CloudAgentLaunch,
	cloudAgentLaunchToEnv,
} from "@superset/shared/cloud-agent-launch";
import {
	SANDBOX_HOST_DB_PATH,
	SANDBOX_WORKSPACE_PATH,
} from "@superset/shared/constants";
import { eq } from "drizzle-orm";
import { env } from "../../env";
import { deleteSandbox, provisionSandbox } from "../../lib/blaxel";
import { resolveCloneTarget } from "../../lib/blaxel/clone-token";
import { cloudRepo } from "../../lib/blaxel/cloud-repo";
import { resolveEnvironment } from "../environment/resolve-environment";
import { generateCloudWorkspaceName } from "./generate-name";

export const FALLBACK_NAME = "Cloud workspace";

/** Derived from the row id so the name is stable and collision-free. */
export function sandboxNameFor(cloudWorkspaceId: string): string {
	return `ws-${cloudWorkspaceId.replaceAll("-", "").slice(0, 24)}`;
}

export interface ProvisionCloudWorkspaceInput {
	cloudWorkspaceId: string;
	/**
	 * Set only when the user didn't type a name, in which case the row holds
	 * `FALLBACK_NAME` and this is what the workspace gets named from.
	 */
	namingPrompt?: string;
	/** A built-in agent to run once the sandbox is up; see cloud-agent-launch. */
	launch?: CloudAgentLaunch;
}

export type ProvisionCloudWorkspaceOutcome =
	| "provisioned"
	| "skipped"
	| "failed";

/**
 * Everything a cloud workspace needs after its row exists: a name, a sandbox,
 * and the `ready` status that makes it openable.
 *
 * Runs detached from the create that asked for it — a job, not a request — so
 * nobody waits on the provider (about a second warm; tens of seconds when the
 * image still has to be pulled). That means it owns the row's terminal state:
 * it must leave `ready` or `failed` behind, because nothing else ever looks at
 * a `provisioning` row.
 *
 * Safe to run twice on the same row: the provider calls are create-if-missing
 * and an already-`ready` row is left alone, so a retried delivery costs a
 * couple of no-op API calls rather than a second sandbox.
 */
export async function provisionCloudWorkspace(
	input: ProvisionCloudWorkspaceInput,
): Promise<ProvisionCloudWorkspaceOutcome> {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, input.cloudWorkspaceId),
	});
	if (!row) return "skipped";
	// `deleted` means the user disposed of it mid-provision; `ready` means a
	// delivery already did this work. Either way there is nothing to do, and
	// provisioning anyway would leave a sandbox nothing references.
	if (row.status !== "provisioning") return "skipped";

	const providerSandboxId = sandboxNameFor(row.id);
	try {
		// Naming is a model call (~0.7s) and the sandbox itself now comes up in
		// about that long, so it is the longest thing here. Run it alongside the
		// clone lookup rather than ahead of it; it can't overlap the provision
		// call itself, which bakes the name into the sandbox's environment.
		const [resolvedName, clone, environment] = await Promise.all([
			input.namingPrompt === undefined
				? Promise.resolve(row.name)
				: generateCloudWorkspaceName(input.namingPrompt).then(
						(generated) => generated ?? row.name,
					),
			cloudRepo().then((repo) => (repo ? resolveCloneTarget(repo) : null)),
			resolveEnvironment(row.environmentId, row.organizationId),
		]);
		if (!environment) {
			throw new Error("Environment not found");
		}
		if (!clone) {
			throw new Error("No repository to clone");
		}

		// Written before the sandbox exists rather than with the final status:
		// the workspace is already on screen by now, so the generated name is
		// worth its own write to land ahead of `ready` rather than with it.
		const nameWrite =
			resolvedName === row.name
				? Promise.resolve()
				: db
						.update(cloudWorkspaces)
						.set({ name: resolvedName })
						.where(eq(cloudWorkspaces.id, row.id));
		// The sandbox configures itself from these on boot: the image already
		// holds the repo and the schema, so there is nothing to run inside it
		// and nothing to wait for. Provisioning is one call.
		const [sandbox] = await Promise.all([
			provisionSandbox({
				name: providerSandboxId,
				environment,
				workspaceEnv: {
					...environment.envs,
					ORGANIZATION_ID: row.organizationId,
					HOST_DB_PATH: SANDBOX_HOST_DB_PATH,
					HOST_MIGRATIONS_FOLDER: "/app/drizzle",
					AUTH_TOKEN: "sandbox",
					SUPERSET_API_URL: env.NEXT_PUBLIC_API_URL,
					SUPERSET_HOST_RUN_MODE: "sandbox",
					SUPERSET_SANDBOX_WORKSPACE_ID: row.id,
					SUPERSET_SANDBOX_WORKSPACE_NAME: resolvedName,
					SUPERSET_SANDBOX_BRANCH: row.branch,
					SUPERSET_SANDBOX_WORKSPACE_PATH: SANDBOX_WORKSPACE_PATH,
					// Compared against the URL baked into the image: a workspace for
					// any other project clones instead of fetching, rather than
					// silently serving the baked repo's code.
					SUPERSET_SANDBOX_REPO_URL: clone.cloneUrl,
					...(clone.token ? { SUPERSET_SANDBOX_GIT_TOKEN: clone.token } : {}),
					...(env.SENTRY_DSN_SANDBOX
						? {
								HOST_SERVICE_SENTRY_DSN: env.SENTRY_DSN_SANDBOX,
								HOST_SERVICE_SENTRY_ENVIRONMENT:
									env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
							}
						: {}),
					SUPERSET_SANDBOX_IMAGE_TAG: environment.sourceRef,
					SUPERSET_SANDBOX_PROVIDER: row.provider,
					...cloudAgentLaunchToEnv(input.launch),
				},
			}),
			nameWrite,
		]);

		await db
			.update(cloudWorkspaces)
			.set({
				providerSandboxId: sandbox.providerSandboxId,
				sandboxUrl: sandbox.sandboxUrl,
				status: "ready",
			})
			.where(eq(cloudWorkspaces.id, row.id));
		return "provisioned";
	} catch (error) {
		// Billing starts at provision, not at ready: everything after that call
		// — resolving the repo, cloning, booting — can fail with a sandbox
		// already running. Without this the failure is silent and permanent,
		// because nothing else ever looks at a `failed` row. The row survives as
		// the record of what went wrong, and as the thing the workspace screen
		// renders its failure from.
		await deleteSandbox(providerSandboxId).catch((teardownError) => {
			console.error(
				`[cloud-workspace] leaked sandbox ${providerSandboxId}`,
				teardownError,
			);
		});
		await db
			.update(cloudWorkspaces)
			.set({ status: "failed" })
			.where(eq(cloudWorkspaces.id, row.id));
		console.error(`[cloud-workspace] provisioning failed for ${row.id}`, error);
		return "failed";
	}
}
