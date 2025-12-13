import type { AppSession, SignedInSession } from "@superset/auth0/types";
import { isSignedIn } from "@superset/auth0/types";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";

/**
 * tRPC Context
 *
 * We use AppSession from @superset/auth0 which wraps Auth0's Session type.
 * - AppSession = Session | null (null when not authenticated)
 * - SignedInSession = Session with non-null user
 *
 * Public procedures may be called by unauthenticated users (null session)
 */
export type TRPCContext = {
	session: AppSession;
};

export const createTRPCContext = (opts: {
	session: AppSession;
}): TRPCContext => {
	return { session: opts.session };
};

const t = initTRPC.context<TRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError:
					error.cause instanceof ZodError ? error.cause.flatten() : null,
			},
		};
	},
});

export const createTRPCRouter = t.router;

export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!isSignedIn(ctx.session)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Not authenticated. Please sign in.",
		});
	}

	return next({
		ctx: {
			// After the isSignedIn check above, we know session is SignedInSession
			session: ctx.session as SignedInSession,
		},
	});
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	// Auth0 user ID is in session.user.sub
	const auth0Id = ctx.session.user.sub;

	const user = await db.query.users.findFirst({
		where: eq(users.auth0Id, auth0Id),
	});

	if (!user) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "User not found in database.",
		});
	}

	if (!user.email.endsWith(COMPANY.EMAIL_DOMAIN)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Admin access requires ${COMPANY.EMAIL_DOMAIN} email.`,
		});
	}

	return next({
		ctx: {
			user,
		},
	});
});
