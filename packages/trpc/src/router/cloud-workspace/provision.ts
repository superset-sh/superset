import { db, dbWs } from "@superset/db/client";
import { cloudWorkspaces, users, v2Projects } from "@superset/db/schema";
import {
	SANDBOX_HOST_DB_PATH,
	SANDBOX_WORKSPACE_PATH,
} from "@superset/shared/constants";
import { and, eq } from "drizzle-orm";
import { env } from "../../env";
import { deleteSandbox, provisionSandbox } from "../../lib/blaxel";
import { resolveCloneTarget } from "../../lib/blaxel/clone-token";
import { generateCloudWorkspaceName } from "./generate-name";
import { issueSandboxSecret } from "./git-credential";

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

	const [project, creator] = await Promise.all([
		db.query.v2Projects.findFirst({
			where: and(
				eq(v2Projects.id, row.projectId),
				eq(v2Projects.organizationId, row.organizationId),
			),
		}),
		row.createdByUserId
			? db.query.users.findFirst({ where: eq(users.id, row.createdByUserId) })
			: Promise.resolve(null),
	]);
	// Commits from inside the sandbox carry the creating user's name, the same
	// way Coder sets GIT_AUTHOR_* from the workspace owner at build. Without
	// this git refuses to commit at all ("unable to auto-detect email").
	const author = creator?.email
		? { name: creator.name || creator.email, email: creator.email }
		: null;

	const providerSandboxId = sandboxNameFor(row.id);
	try {
		if (!project) {
			throw new Error("Project not found in this organization");
		}
		// Naming is a model call (~0.7s) and the sandbox itself now comes up in
		// about that long, so it is the longest thing here. Run it alongside the
		// clone lookup rather than ahead of it; it can't overlap the provision
		// call itself, which bakes the name into the sandbox's environment.
		const [resolvedName, clone, sandboxSecret] = await Promise.all([
			input.namingPrompt === undefined
				? Promise.resolve(row.name)
				: generateCloudWorkspaceName(input.namingPrompt).then(
						(generated) => generated ?? row.name,
					),
			resolveCloneTarget(row.projectId),
			// The one durable secret the sandbox holds — not a git credential
			// but the thing it proves itself with to ask for one. Minted here
			// because it has to reach the sandbox through the same environment
			// as everything else.
			issueSandboxSecret(row.id),
		]);
		// A null secret means the row already had one, so a sandbox already
		// holds it: this is a retry after an earlier attempt died mid-flight.
		// createIfNotExists hands that sandbox back with its env intact, which
		// is exactly right — the one thing a retry must never do is re-issue
		// the secret, because the sandbox's env can't be changed to match.
		if (!clone) {
			throw new Error("Project has no repository to clone");
		}

		// Written before the sandbox exists rather than with the final status:
		// the workspace is already on screen by now, so the generated name is
		// worth its own write to land ahead of `ready` rather than with it.
		const nameWrite =
			resolvedName === row.name
				? Promise.resolve()
				: dbWs
						.update(cloudWorkspaces)
						.set({ name: resolvedName })
						.where(eq(cloudWorkspaces.id, row.id));
		// The sandbox configures itself from these on boot: the image already
		// holds the repo and the schema, so there is nothing to run inside it
		// and nothing to wait for. Provisioning is one call.
		const [sandbox] = await Promise.all([
			provisionSandbox({
				name: providerSandboxId,
				image: env.BLAXEL_SANDBOX_IMAGE,
				workspaceEnv: {
					ORGANIZATION_ID: row.organizationId,
					HOST_DB_PATH: SANDBOX_HOST_DB_PATH,
					HOST_MIGRATIONS_FOLDER: "/app/drizzle",
					AUTH_TOKEN: "sandbox",
					SUPERSET_API_URL: env.NEXT_PUBLIC_API_URL,
					SUPERSET_HOST_RUN_MODE: "sandbox",
					// Git never prompts interactively in a sandbox: when the credential
					// broker refuses, an agent's shell must see a failure, not a hang.
					GIT_TERMINAL_PROMPT: "0",
					SUPERSET_SANDBOX_WORKSPACE_ID: row.id,
					SUPERSET_SANDBOX_WORKSPACE_NAME: resolvedName,
					SUPERSET_SANDBOX_PROJECT_NAME: project.name,
					SUPERSET_SANDBOX_BRANCH: row.branch,
					SUPERSET_SANDBOX_WORKSPACE_PATH: SANDBOX_WORKSPACE_PATH,
					...(author
						? {
								GIT_AUTHOR_NAME: author.name,
								GIT_AUTHOR_EMAIL: author.email,
								GIT_COMMITTER_NAME: author.name,
								GIT_COMMITTER_EMAIL: author.email,
							}
						: {}),
					// Compared against the URL baked into the image: a workspace for
					// any other project clones instead of fetching, rather than
					// silently serving the baked repo's code.
					SUPERSET_SANDBOX_REPO_URL: clone.cloneUrl,
					...(sandboxSecret ? { SUPERSET_SANDBOX_SECRET: sandboxSecret } : {}),
					// Still handed over for the first fetch in start.sh, which runs
					// before host-service is up to broker anything. It expires in
					// ~1h and nothing after boot reads it; git operations from then
					// on go through the credential broker.
					...(clone.token ? { SUPERSET_SANDBOX_GIT_TOKEN: clone.token } : {}),
				},
			}),
			nameWrite,
		]);

		await dbWs
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
		await dbWs
			.update(cloudWorkspaces)
			.set({ status: "failed" })
			.where(eq(cloudWorkspaces.id, row.id));
		console.error(`[cloud-workspace] provisioning failed for ${row.id}`, error);
		return "failed";
	}
}
