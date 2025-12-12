import type { SignedInAuthObject, SignedOutAuthObject } from "@clerk/backend";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";

type ClerkAuth = SignedInAuthObject | SignedOutAuthObject;

export type TRPCContext = {
	auth: ClerkAuth;
	userId: string | null;
};

export const createTRPCContext = async (opts: {
	auth: ClerkAuth;
}): Promise<TRPCContext> => {
	const clerkUserId = opts.auth.userId;

	if (!clerkUserId) {
		return { auth: opts.auth, userId: null };
	}

	const user = await db.query.users.findFirst({
		where: eq(users.clerkId, clerkUserId),
	});

	return {
		auth: opts.auth,
		userId: user?.id ?? null,
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

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.userId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Not authenticated. Please sign in.",
		});
	}

	return next({
		ctx: {
			userId: ctx.userId,
		},
	});
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	const user = await db.query.users.findFirst({
		where: eq(users.id, ctx.userId),
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
