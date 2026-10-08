import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { nudge } from "../../lib/realtime";
import {
	activityTargets,
	addShares,
	addSharesSchema,
	type GranteeRef,
	listGrantees,
	removeShare,
	removeShareSchema,
	sharingResourceSchema,
	validateGrantees,
} from "../../lib/sharing";
import { jwtProcedure, userError } from "../../trpc";
import { loadVisibleWorkspace } from "./access";
import { recordCloudWorkspaceActivity } from "./activity";

type SharingContext = Parameters<typeof loadVisibleWorkspace>[0];

async function loadOwnedWorkspace(ctx: SharingContext, id: string) {
	const row = await loadVisibleWorkspace(ctx, id);
	if (row.createdByUserId !== ctx.userId) {
		throw userError({
			code: "FORBIDDEN",
			message: "Only the owner can change who this is shared with",
			i18nKey: "serverError.sharing.onlyOwner",
		});
	}
	return row;
}

async function recordShareActivity(
	cloudWorkspaceId: string,
	userId: string,
	event: "shared" | "unshared",
	grantees: GranteeRef[],
) {
	for (const target of await activityTargets(grantees)) {
		await recordCloudWorkspaceActivity(
			db,
			cloudWorkspaceId,
			{ kind: "user", userId },
			{ event, ...target },
		);
	}
}

export const cloudWorkspaceSharingRouter = {
	get: jwtProcedure
		.input(sharingResourceSchema)
		.query(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			const [owner] = row.createdByUserId
				? await db
						.select({
							userId: users.id,
							name: users.name,
							email: users.email,
							image: users.image,
						})
						.from(users)
						.where(eq(users.id, row.createdByUserId))
						.limit(1)
				: [];
			return {
				owner: owner ?? null,
				grantees: await listGrantees({ kind: "cloudWorkspace", id: row.id }),
				canManage: row.createdByUserId === ctx.userId,
				visibility: row.visibility,
			};
		}),

	add: jwtProcedure.input(addSharesSchema).mutation(async ({ ctx, input }) => {
		const row = await loadOwnedWorkspace(ctx, input.id);
		const grantees = await validateGrantees({
			organizationId: row.organizationId,
			ownerId: row.createdByUserId,
			grantees: input.grantees,
		});
		const added = await addShares({
			target: { kind: "cloudWorkspace", id: row.id },
			grantees,
			sharedByUserId: ctx.userId,
		});
		if (added.length) {
			await recordShareActivity(row.id, ctx.userId, "shared", added);
			nudge(row.organizationId, "cloud_workspaces");
		}
		return { added };
	}),

	remove: jwtProcedure
		.input(removeShareSchema)
		.mutation(async ({ ctx, input }) => {
			const row = await loadOwnedWorkspace(ctx, input.id);
			const removed = await removeShare(
				{ kind: "cloudWorkspace", id: row.id },
				input.grantee,
			);
			if (removed) {
				await recordShareActivity(row.id, ctx.userId, "unshared", [
					input.grantee,
				]);
				nudge(row.organizationId, "cloud_workspaces");
			}
			return { removed };
		}),
} satisfies TRPCRouterRecord;
