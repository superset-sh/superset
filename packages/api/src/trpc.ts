import { db } from "@superset/db/client";
import { initTRPC, TRPCError } from "@trpc/server";
import SuperJSON from "superjson";
import { ZodError } from "zod";
import { env } from "./env";

export const createTRPCContext = async (opts: { headers: Headers }) => {
	const mockUserId = env.MOCK_USER_ID;

	return {
		db,
		session: mockUserId
			? {
					user: {
						id: mockUserId,
					},
				}
			: null,
		headers: opts.headers,
	};
};

const t = initTRPC.context<typeof createTRPCContext>().create({
	transformer: SuperJSON,
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

const timingMiddleware = t.middleware(async ({ next, path }) => {
	const start = Date.now();

	if (process.env.NODE_ENV === "development") {
		const delay = Math.random() * 400 + 100;
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	const result = await next();
	const end = Date.now();

	console.log(`[TRPC] ${path} took ${end - start}ms`);

	return result;
});

export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure.use(timingMiddleware);

export const protectedProcedure = t.procedure
	.use(timingMiddleware)
	.use(async ({ ctx, next }) => {
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
