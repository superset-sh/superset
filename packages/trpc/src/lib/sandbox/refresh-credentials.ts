/**
 * A running box's request for fresh credential rules. host-service calls it
 * on a timer with the host secret it was booted with, which the API derives
 * rather than stores, so the box proves which workspace it is without holding
 * anything the API does not already know. The token itself never leaves the
 * API: the answer is a firewall policy update, not a value.
 */
import { timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { sandboxHostSecretFor } from "./access";
import { buildSandboxClaim } from "./claim";
import { applySandboxPolicy } from "./vercel";

export type RefreshSandboxCredentialsOutcome =
	| "applied"
	| "not-running"
	| "unauthorized"
	| "not-ready";

export async function refreshSandboxCredentials(args: {
	workspaceId: string;
	presentedSecret: string;
}): Promise<RefreshSandboxCredentialsOutcome> {
	const expected = Buffer.from(await sandboxHostSecretFor(args.workspaceId));
	const presented = Buffer.from(args.presentedSecret);
	if (
		expected.length !== presented.length ||
		!timingSafeEqual(expected, presented)
	) {
		return "unauthorized";
	}
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, args.workspaceId),
	});
	if (!row?.providerSandboxId || row.status !== "ready") return "not-ready";
	const { claim } = await buildSandboxClaim({ row });
	return applySandboxPolicy({
		providerSandboxId: row.providerSandboxId,
		networkPolicy: claim.networkPolicy,
	});
}
