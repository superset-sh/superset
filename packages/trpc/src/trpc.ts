import { resolveBearerAuth } from "@superset/auth/resolve-bearer-auth";
import type { auth, Session } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { COMPANY, ORGANIZATION_HEADER } from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
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

export const protectedProcedure = t.procedure
	.use(async ({ ctx, next }) => {
		if (!ctx.session) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Not authenticated. Please sign in.",
			});
		}

		return next({ ctx: { ...ctx, session: ctx.session } });
	})
	.use(async ({ ctx, next }) => {
		const sessionOrgId = ctx.session.session.activeOrganizationId ?? null;
		const headerOrgId = ctx.headers.get(ORGANIZATION_HEADER)?.trim() || null;

		let activeOrganizationId = sessionOrgId;
		if (headerOrgId && headerOrgId !== sessionOrgId) {
			const membership = await db.query.members.findFirst({
				where: and(
					eq(members.userId, ctx.session.user.id),
					eq(members.organizationId, headerOrgId),
				),
			});
			if (!membership) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: `Not a member of organization ${headerOrgId}`,
				});
			}
			activeOrganizationId = headerOrgId;
		}

		return next({
			ctx: { ...ctx, activeOrganizationId, userId: ctx.session.user.id },
		});
	});

export const bearerProcedure = t.procedure.use(async ({ ctx, next }) => {
	let bearerAuth: Awaited<ReturnType<typeof resolveBearerAuth>> = null;
	try {
		bearerAuth = await resolveBearerAuth(ctx.headers);
	} catch (error) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: error instanceof Error ? error.message : "Bearer auth rejected",
		});
	}

	if (bearerAuth) {
		return next({
			ctx: {
				userId: bearerAuth.userId,
				email: bearerAuth.email ?? "",
				organizationIds: bearerAuth.organizationIds,
				activeOrganizationId: bearerAuth.activeOrganizationId,
				authKind: bearerAuth.kind,
				scopes: bearerAuth.scopes,
			},
		});
	}

	if (ctx.session) {
		const userId = ctx.session.user.id;
		const memberRows = await db.query.members.findMany({
			where: eq(members.userId, userId),
			columns: { organizationId: true },
		});
		const organizationIds = memberRows.map((row) => row.organizationId);

		const sessionOrgId = ctx.session.session.activeOrganizationId ?? null;
		const headerOrgId = ctx.headers.get(ORGANIZATION_HEADER)?.trim() || null;

		let activeOrganizationId = sessionOrgId ?? organizationIds[0] ?? null;
		if (headerOrgId && headerOrgId !== sessionOrgId) {
			if (!organizationIds.includes(headerOrgId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: `Not a member of organization ${headerOrgId}`,
				});
			}
			activeOrganizationId = headerOrgId;
		}

		return next({
			ctx: {
				userId,
				email: ctx.session.user.email ?? "",
				organizationIds,
				activeOrganizationId,
				authKind: "session" as const,
				scopes: [] as string[],
			},
		});
	}

	throw new TRPCError({
		code: "UNAUTHORIZED",
		message: "Not authenticated. Provide a bearer JWT, x-api-key, or session.",
	});
});

/**
 * @deprecated Use {@link bearerProcedure}. Kept as an alias during migration.
 */
export const jwtProcedure = bearerProcedure;

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	if (!ctx.session.user.email.endsWith(COMPANY.EMAIL_DOMAIN)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Admin access requires ${COMPANY.EMAIL_DOMAIN} email.`,
		});
	}

	return next({ ctx });
});
