import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import type { CloudAgentLaunch } from "@superset/shared/cloud-agent-launch";
import { CLOUD_WORKSPACE_PROVISION_TRANSACTION } from "@superset/shared/constants";
import { eq } from "drizzle-orm";
import { nudge } from "../../lib/realtime";
import {
	buildSandboxClaim,
	deleteSandbox,
	provisionSandbox,
	SandboxNotReadyError,
	settleSandbox,
	stopSandbox,
} from "../../lib/sandbox";
import { generateCloudWorkspaceName } from "./generate-name";
import { transitionCloudWorkspace } from "./transition";

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
 * Everything a cloud workspace needs after its row exists: a sandbox with
 * its identity written and boot started, the `ready` status that makes it
 * openable, and the managed environment pushed once host-service answers.
 *
 * Runs detached from the create that asked for it, so it owns the row's
 * terminal state: it must leave `ready` or `failed` behind. The name is
 * generated alongside, off the sandbox's critical path: the box never
 * learns it, the API's row is what carries it.
 *
 * Safe to run twice on the same row: the provider calls are create-if-missing
 * and an already-`ready` row is left alone.
 */
export async function provisionCloudWorkspace(
	input: ProvisionCloudWorkspaceInput,
): Promise<ProvisionCloudWorkspaceOutcome> {
	const outcome = await Sentry.startSpan(
		{
			name: CLOUD_WORKSPACE_PROVISION_TRANSACTION,
			op: "job",
			forceTransaction: true,
			attributes: { "cloud_workspace.id": input.cloudWorkspaceId },
		},
		() => provision(input),
	);
	// The job runs after its request has answered, so nothing else flushes
	// the transaction before the runtime moves on.
	await Sentry.flush(2_000).catch(() => false);
	return outcome;
}

async function provision(
	input: ProvisionCloudWorkspaceInput,
): Promise<ProvisionCloudWorkspaceOutcome> {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, input.cloudWorkspaceId),
	});
	if (!row) return "skipped";
	if (row.status !== "provisioning") return "skipped";

	const providerSandboxId = sandboxNameFor(row.id);
	const naming =
		input.namingPrompt === undefined
			? Promise.resolve()
			: generateCloudWorkspaceName(input.namingPrompt).then(
					async (generated) => {
						if (!generated || generated === row.name) return;
						await db
							.update(cloudWorkspaces)
							.set({ name: generated })
							.where(eq(cloudWorkspaces.id, row.id));
						nudge(row.organizationId, "cloud_workspaces");
					},
				);
	try {
		const { claim, environment } = await Sentry.startSpan(
			{ name: "claim", op: "sandbox" },
			() =>
				buildSandboxClaim({ row, launch: input.launch, withRepoHooks: true }),
		);
		const sandbox = await Sentry.startSpan(
			{ name: "create", op: "sandbox" },
			() => provisionSandbox({ name: providerSandboxId, environment, claim }),
		);
		const ready = await transitionCloudWorkspace({
			id: row.id,
			from: ["provisioning"],
			to: "ready",
			set: {
				providerSandboxId: sandbox.providerSandboxId,
				sandboxUrl: sandbox.sandboxUrl,
			},
		});
		if (!ready) {
			// Deleted while the box was being made: the delete won the row, so
			// the box it never knew about goes with it. A duplicate delivery of
			// this job loses the row to the first one and must leave the box be:
			// the name is per workspace, so it is the same box.
			const current = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, row.id),
				columns: { status: true },
			});
			if (current?.status === "deleted") {
				await deleteSandbox(providerSandboxId);
			}
			await naming.catch(() => {});
			return "skipped";
		}
		nudge(row.organizationId, "cloud_workspaces");
		// The box is booting; the environment it needs arrives once host-service
		// answers. The client's own wake pushes it again, so a workspace nobody
		// opens still gets it (an agent launched at boot waits for this).
		await Sentry.startSpan({ name: "settle", op: "sandbox" }, () =>
			settleSandbox({
				providerSandboxId,
				hostTarget: sandbox.hostTarget,
				claim,
			}),
		);
		await naming.catch((error) =>
			console.error(`[cloud-workspace] naming failed for ${row.id}`, error),
		);
		return "provisioned";
	} catch (error) {
		await naming.catch(() => {});
		// A box that booted but whose host-service never answered is kept for
		// diagnosis, stopped: its boot log, desktop and shell are a resume
		// away, it costs storage rather than compute meanwhile, and a delete
		// from the sidebar still removes it. Any other failure must not leak
		// a box, since billing started at provision.
		const keepForDiagnosis = error instanceof SandboxNotReadyError;
		await (keepForDiagnosis ? stopSandbox : deleteSandbox)(
			providerSandboxId,
		).catch((teardownError) => {
			console.error(
				`[cloud-workspace] ${keepForDiagnosis ? "could not stop" : "leaked"} sandbox ${providerSandboxId}`,
				teardownError,
			);
		});
		await transitionCloudWorkspace({
			id: row.id,
			from: ["provisioning", "ready"],
			to: "failed",
			set: keepForDiagnosis ? { providerSandboxId } : {},
		});
		nudge(row.organizationId, "cloud_workspaces");
		console.error(`[cloud-workspace] provisioning failed for ${row.id}`, error);
		return "failed";
	}
}
