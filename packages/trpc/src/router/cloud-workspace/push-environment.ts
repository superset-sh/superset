import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { buildSandboxClaim, pushManagedEnvIfRunning } from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";

export interface PushEnvironmentInput {
	environmentId: string;
	organizationId: string;
}

/**
 * Hands an environment's current variables to every running box started from
 * it, so new terminals there see a change without waiting for the next wake.
 * Open terminals keep the environment they started with.
 */
export async function pushEnvironmentToRunningWorkspaces(
	input: PushEnvironmentInput,
): Promise<{ applied: number; failed: number }> {
	const rows = await db.query.cloudWorkspaces.findMany({
		where: and(
			eq(cloudWorkspaces.environmentId, input.environmentId),
			eq(cloudWorkspaces.organizationId, input.organizationId),
			eq(cloudWorkspaces.status, "ready"),
			eq(cloudWorkspaces.provider, "vercel"),
		),
	});
	const outcomes = await Promise.allSettled(
		rows.map(async (row) => {
			const { claim } = await buildSandboxClaim({ row });
			return pushManagedEnvIfRunning({
				providerSandboxId: row.providerSandboxId,
				claim,
			});
		}),
	);
	let applied = 0;
	let failed = 0;
	outcomes.forEach((outcome, index) => {
		if (outcome.status === "fulfilled") {
			if (outcome.value === "applied") applied++;
			return;
		}
		failed++;
		console.warn(
			`[cloud-workspace] environment push failed for ${rows[index]?.id}`,
			outcome.reason,
		);
	});
	return { applied, failed };
}

export async function queueEnvironmentPush(
	input: PushEnvironmentInput,
): Promise<void> {
	await publishCloudWorkspaceJob({
		path: "/api/cloud-workspaces/push-environment",
		body: input,
		runLocally: pushEnvironmentToRunningWorkspaces,
	});
}
