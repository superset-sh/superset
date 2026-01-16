import type { auth, Session } from "@superset/auth/server";
import { COMPANY } from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

export type TRPCContext = {
	session: Session | null;
	auth: typeof auth;
	headers: Headers;
};

export const createTRPCContext = (opts: TRPCContext): TRPCContext => opts;

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
	if (!ctx.session) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Not authenticated. Please sign in.",
		});
	}

	return next({ ctx: { session: ctx.session } });
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	if (!ctx.session.user.email.endsWith(COMPANY.EMAIL_DOMAIN)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Admin access requires ${COMPANY.EMAIL_DOMAIN} email.`,
		});
	}

	return next({ ctx });
});
