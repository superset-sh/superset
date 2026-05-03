import {
	BearerAuthError,
	type BearerAuthResult,
	resolveBearerAuth,
} from "@superset/auth/resolve-bearer-auth";
import type { auth, Session } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { COMPANY, ORGANIZATION_HEADER } from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";

export type TRPCContext = {
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

type AuthKind = "session" | "jwt" | "apiKey";

export type AuthenticatedCtx = {
	userId: string;
	email: string;
	activeOrganizationId: string | null;
	organizationIds: string[];
	authKind: AuthKind;
	scopes: string[];
};

function bearerToCtx(bearer: BearerAuthResult): AuthenticatedCtx {
	return {
		userId: bearer.userId,
		email: bearer.email ?? "",
		activeOrganizationId: bearer.activeOrganizationId,
		organizationIds: bearer.organizationIds,
		authKind: bearer.kind,
		scopes: bearer.scopes,
	};
}

async function sessionToCtx(
	headers: Headers,
	session: Session,
): Promise<AuthenticatedCtx> {
	const userId = session.user.id;
	const memberRows = await db.query.members.findMany({
		where: eq(members.userId, userId),
		columns: { organizationId: true },
	});
	const organizationIds = [
		...new Set(memberRows.map((row) => row.organizationId)),
	];

	const sessionOrgId = session.session.activeOrganizationId ?? null;
	const headerOrgId = headers.get(ORGANIZATION_HEADER)?.trim() || null;

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

	return {
		userId,
		email: session.user.email ?? "",
		activeOrganizationId,
		organizationIds,
		authKind: "session",
		scopes: [],
	};
}

/**
 * The single auth gate. Resolves identity from bearer (JWT or sk_live_*)
 * or from the cookie session, and produces a flat ctx no caller needs to
 * unwrap. Pick this for any procedure that requires a signed-in user;
 * compose finer middleware (e.g. {@link adminProcedure}) on top.
 */
export const authenticatedProcedure = t.procedure.use(async ({ ctx, next }) => {
	let bearer: BearerAuthResult | null = null;
	try {
		bearer = await resolveBearerAuth(ctx.headers);
	} catch (error) {
		if (error instanceof BearerAuthError) {
			throw new TRPCError({
				code: error.reason === "forbidden_org" ? "FORBIDDEN" : "UNAUTHORIZED",
				message: error.message,
			});
		}
		throw error;
	}

	if (bearer) {
		return next({ ctx: { ...ctx, ...bearerToCtx(bearer) } });
	}

	const session = await ctx.auth.api.getSession({ headers: ctx.headers });
	if (session) {
		return next({
			ctx: { ...ctx, ...(await sessionToCtx(ctx.headers, session)) },
		});
	}

	throw new TRPCError({
		code: "UNAUTHORIZED",
		message: "Not authenticated.",
	});
});

export const adminProcedure = authenticatedProcedure.use(
	async ({ ctx, next }) => {
		if (!ctx.email.endsWith(COMPANY.EMAIL_DOMAIN)) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: `Admin access requires ${COMPANY.EMAIL_DOMAIN} email.`,
			});
		}
		return next({ ctx });
	},
);
