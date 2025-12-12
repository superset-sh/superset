import type { SessionAuthObject } from "@clerk/backend";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";

// SignedInAuthObject isn't exported from @clerk/backend main entry,
// so we extract it from the SessionAuthObject union
type SignedInAuthObject = Extract<SessionAuthObject, { userId: string }>;

/**
 * tRPC Context
 *
 * We use SessionAuthObject from @clerk/backend (not @clerk/nextjs) because:
 * - The API is hosted on Next.js with clerkMiddleware handling auth
 * - Expo/Desktop clients send Bearer tokens to this API
 * - clerkMiddleware handles both cookie auth (web) and Bearer tokens (mobile/desktop)
 * - @clerk/backend types work across all clients, while @clerk/nextjs would
 *   cause dependency issues in Expo/Desktop which don't have Next.js
 *
 * SessionAuthObject = SignedInAuthObject | SignedOutAuthObject
 * Public procedures may be called by unauthenticated users (SignedOutAuthObject)
 */
export type TRPCContext = {
	session: SessionAuthObject;
};

export const createTRPCContext = (opts: {
	session: SessionAuthObject;
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
	if (!ctx.session.userId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Not authenticated. Please sign in.",
		});
	}

	return next({
		ctx: {
			// Cast needed because TypeScript doesn't propagate type narrowing through next()
			// After the userId check above, we know session is SignedInAuthObject
			session: ctx.session as SignedInAuthObject,
		},
	});
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	const user = await db.query.users.findFirst({
		where: eq(users.clerkId, ctx.session.userId),
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
