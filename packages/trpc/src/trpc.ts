import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";

import { env } from "./env";

/**
 * Context passed to every tRPC procedure
 */
export type TRPCContext = {
	session: { userId: string } | null;
	headers: Headers;
};

/**
 * Create the tRPC context for each request
 */
export const createTRPCContext = async (opts: {
	headers: Headers;
}): Promise<TRPCContext> => {
	const mockUserId = env.MOCK_USER_ID;

	return {
		session: mockUserId ? { userId: mockUserId } : null,
		headers: opts.headers,
	};
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

/**
 * Protected procedure - requires authenticated session
 * Just validates session exists, no DB fetch
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.session?.userId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message:
				"Not authenticated. Set MOCK_USER_ID in .env to mock authentication.",
		});
	}

	return next({
		ctx: {
			session: ctx.session,
		},
	});
});

/**
 * Admin procedure - requires authenticated user with @superset.sh email
 * Fetches user from DB and validates domain for API security
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	const user = await db.query.users.findFirst({
		where: eq(users.id, ctx.session.userId),
	});

	if (!user) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "User not found in database.",
		});
	}

	if (!user.email.endsWith(COMPANY.emailDomain)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Admin access requires ${COMPANY.emailDomain} email.`,
		});
	}

	return next({
		ctx: {
			user,
		},
	});
});
