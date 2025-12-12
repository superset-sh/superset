import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { env } from "./env";

/**
 * Context passed to every tRPC procedure
 */
export type TRPCContext = {
	session: { user: { id: string } } | null;
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
		session: mockUserId ? { user: { id: mockUserId } } : null,
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

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.session?.user) {
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
