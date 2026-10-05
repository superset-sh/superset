import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { nudge } from "../../lib/realtime";
import {
	buildSandboxClaim,
	describeSandbox,
	stopAndSnapshot,
	wakeSandbox,
} from "../../lib/sandbox";
import { transitionCloudWorkspace } from "./transition";

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

export interface WokenCloudWorkspace {
	hostTarget: string;
	/** The creator's agent sign-ins changed after the box booted; only a restart hands them to running agents. */
	agentCredentialsChanged: boolean;
}

/** Resumes or extends the sandbox and records its current address. */
export async function wakeCloudWorkspace(
	row: CloudWorkspaceRow,
): Promise<WokenCloudWorkspace> {
	const { claim, agentCredentialDigest } = await buildSandboxClaim({ row });
	const { hostTarget, booted } = await wakeSandbox({
		providerSandboxId: row.providerSandboxId,
		claim,
	});
	const set: Partial<CloudWorkspaceRow> = {
		...(hostTarget !== row.sandboxUrl ? { sandboxUrl: hostTarget } : {}),
		...(booted ? { bootAgentCredentialDigest: agentCredentialDigest } : {}),
	};
	if (Object.keys(set).length > 0) {
		await db
			.update(cloudWorkspaces)
			.set(set)
			.where(eq(cloudWorkspaces.id, row.id));
	}
	return {
		hostTarget,
		agentCredentialsChanged:
			!booted &&
			row.bootAgentCredentialDigest !== null &&
			row.bootAgentCredentialDigest !== agentCredentialDigest,
	};
}

/** Ends every process on the box and boots it again from a fresh claim. */
export async function restartCloudWorkspace(
	row: CloudWorkspaceRow,
): Promise<WokenCloudWorkspace> {
	const { running } = await describeSandbox(row.providerSandboxId);
	if (running) await stopAndSnapshot(row.providerSandboxId);
	return wakeCloudWorkspace(row);
}

/**
 * For a sandbox that is gone or can never resume. A `ready` row nothing can
 * open would sit in the sidebar forever; failed is the state the client
 * already renders with a way out.
 */
export async function markSandboxUnavailable(
	row: CloudWorkspaceRow,
	error: unknown,
): Promise<void> {
	await transitionCloudWorkspace({
		id: row.id,
		from: ["ready"],
		to: "failed",
		set: { sandboxUrl: null },
	});
	nudge(row.organizationId, "cloud_workspaces");
	console.error(`[cloud-workspace] ${row.id} sandbox unavailable`, error);
}
