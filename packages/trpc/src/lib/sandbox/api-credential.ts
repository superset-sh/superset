/**
 * A box acting for its own workspace. The credential is derived from the same
 * secret the gate uses and never stored, so a box proves which workspace it is
 * without holding anything the API does not already know — and because the
 * firewall adds it on the way out, nothing inside the box can read it.
 *
 * It grants the creator's identity, so what it may do is deliberately narrow:
 * see SANDBOX_ALLOWED_PROCEDURES. Anything else is a person's call, from a
 * client they signed into.
 */
import { timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { cloudWorkspaces, members } from "@superset/db/schema";
import { sandboxApiCredential } from "@superset/shared/sandbox-gate";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "../../env";

export interface SandboxCaller {
	workspaceId: string;
	organizationId: string;
	userId: string;
}

/** Everything `superset` in a box legitimately does, and nothing else. */
export const SANDBOX_ALLOWED_PROCEDURES: ReadonlySet<string> = new Set([
	"cloudWorkspace.available",
	"cloudWorkspace.list",
	"cloudWorkspace.create",
	"cloudWorkspace.access",
	"cloudWorkspace.hostTicket",
	"environment.list",
	"page.assets.upload",
	"page.create",
	"page.get",
	"page.list",
	"page.listPaginated",
	"page.publish",
	"page.pull",
	"page.versions",
	"user.me",
	"user.myOrganization",
	"user.myOrganizations",
]);

function equal(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The workspace a request comes from, or null. The creator must still be a
 * member of the workspace's organization: a box outlives the person's access
 * to the org otherwise.
 */
export async function resolveSandboxCaller(
	header: string | null,
): Promise<SandboxCaller | null> {
	const [workspaceId, presented] = header?.split(".") ?? [];
	if (!workspaceId || !presented) return null;
	if (
		!equal(
			presented,
			await sandboxApiCredential(env.SANDBOX_GATE_SECRET, workspaceId),
		)
	) {
		return null;
	}
	const row = await db.query.cloudWorkspaces.findFirst({
		where: and(
			eq(cloudWorkspaces.id, workspaceId),
			isNull(cloudWorkspaces.deletedAt),
		),
	});
	if (!row?.createdByUserId) return null;
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.userId, row.createdByUserId),
			eq(members.organizationId, row.organizationId),
		),
	});
	if (!membership) return null;
	return {
		workspaceId: row.id,
		organizationId: row.organizationId,
		userId: row.createdByUserId,
	};
}
