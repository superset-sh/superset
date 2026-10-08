import { db } from "@superset/db/client";
import { pages, users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
	addPageSharesSchema,
	addShares,
	listGrantees,
	removeShare,
	removeShareSchema,
	setPageShareRole,
	setShareRoleSchema,
	sharingResourceSchema,
	validateGrantees,
} from "../../lib/sharing";
import { protectedProcedure, userError } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	assertPageReadable,
	assertPageWritable,
	loadPageShareRole,
	pageAccess,
} from "./access";

async function loadSharedPage(
	ctx: Parameters<typeof requireActiveOrgMembership>[0] & {
		session: { user: { id: string } };
	},
	id: string,
) {
	const organizationId = await requireActiveOrgMembership(ctx);
	const userId = ctx.session.user.id;
	const [page] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.organizationId, organizationId), eq(pages.id, id)))
		.limit(1);
	if (!page) {
		throw userError({
			code: "NOT_FOUND",
			message: "Page not found",
			i18nKey: "serverError.page.pageNotFound",
		});
	}
	const shareRole = await loadPageShareRole(page, userId);
	assertPageReadable(page, userId, shareRole);
	return { page, userId, shareRole };
}

async function loadManagedPage(
	ctx: Parameters<typeof loadSharedPage>[0],
	id: string,
) {
	const loaded = await loadSharedPage(ctx, id);
	assertPageWritable(loaded.page, loaded.userId, loaded.shareRole);
	return loaded;
}

export const pageSharingRouter = {
	get: protectedProcedure
		.input(sharingResourceSchema)
		.query(async ({ ctx, input }) => {
			const { page, userId, shareRole } = await loadSharedPage(ctx, input.id);
			const [owner] = page.createdByUserId
				? await db
						.select({
							userId: users.id,
							name: users.name,
							email: users.email,
							image: users.image,
						})
						.from(users)
						.where(eq(users.id, page.createdByUserId))
						.limit(1)
				: [];
			return {
				owner: owner ?? null,
				grantees: await listGrantees({ kind: "page", id: page.id }),
				canManage: pageAccess(page, userId, shareRole).canManage,
				orgRole: page.orgRole,
			};
		}),

	add: protectedProcedure
		.input(addPageSharesSchema)
		.mutation(async ({ ctx, input }) => {
			const { page, userId } = await loadManagedPage(ctx, input.id);
			const grantees = await validateGrantees({
				organizationId: page.organizationId,
				ownerId: page.createdByUserId,
				grantees: input.grantees,
			});
			const added = await addShares({
				target: { kind: "page", id: page.id },
				grantees,
				sharedByUserId: userId,
				role: input.role,
			});
			return { added };
		}),

	remove: protectedProcedure
		.input(removeShareSchema)
		.mutation(async ({ ctx, input }) => {
			const { page } = await loadManagedPage(ctx, input.id);
			return {
				removed: await removeShare(
					{ kind: "page", id: page.id },
					input.grantee,
				),
			};
		}),

	setRole: protectedProcedure
		.input(setShareRoleSchema)
		.mutation(async ({ ctx, input }) => {
			const { page } = await loadManagedPage(ctx, input.id);
			return {
				updated: await setPageShareRole(page.id, input.grantee, input.role),
			};
		}),
} satisfies TRPCRouterRecord;
