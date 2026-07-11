import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { accounts, users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../../trpc";

export const adminRouter = {
	listUsers: adminProcedure.query(() => {
		return db.query.users.findMany({
			orderBy: desc(users.createdAt),
		});
	}),

	deleteUser: adminProcedure
		.input(z.object({ userId: z.string() }))
		.mutation(async ({ input }) => {
			// Delete user - Better Auth handles cascading session cleanup
			await db.delete(users).where(eq(users.id, input.userId));
			return { success: true };
		}),

	/** Sets an email+password credential on the signed-in admin's own account
	 * through Better Auth's hasher (scrypt, salted — never write the
	 * accounts.password column directly), so OAuth-only accounts can also
	 * sign in with a password (e.g. mobile dev builds where OAuth is
	 * unavailable).
	 *
	 * Hand-composed because Better Auth has no upsert for this:
	 * `auth.api.setPassword` throws PASSWORD_ALREADY_SET on existing
	 * credentials, and the admin plugin's `setUserPassword` is update-only
	 * (and we don't run that plugin). Both endpoints internally use exactly
	 * these `context.password.hash` + `internalAdapter` calls. */
	setMyPassword: adminProcedure
		.input(z.object({ password: z.string().min(8) }))
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const context = await auth.$context;
			const passwordHash = await context.password.hash(input.password);

			const credential = await db.query.accounts.findFirst({
				where: and(
					eq(accounts.userId, userId),
					eq(accounts.providerId, "credential"),
				),
			});
			if (credential) {
				await context.internalAdapter.updatePassword(userId, passwordHash);
			} else {
				await context.internalAdapter.createAccount({
					userId,
					providerId: "credential",
					accountId: userId,
					password: passwordHash,
				});
			}
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
