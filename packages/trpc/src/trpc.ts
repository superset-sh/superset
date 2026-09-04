import type { auth, Session } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { COMPANY, ORGANIZATION_HEADER } from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { formatError, userError } from "./i18n-error";
import { posthog } from "./lib/analytics";

export type { I18nErrorCause } from "./i18n-error";
export { isI18nErrorCause, userError } from "./i18n-error";

export interface ApiClientInfo {
	product: "desktop" | "mobile" | "cli" | "sdk";
	version: string;
}

export const CLIENT_VERSION_HEADER = "x-superset-client";

const CLIENT_HEADER_PATTERN =
	/^(desktop|mobile|cli|sdk)\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/;

// Absent or unparseable header = web or a pre-header build, both treated as
// always-current.
export function parseClientHeader(headers: Headers): ApiClientInfo | null {
	const match = headers
		.get(CLIENT_VERSION_HEADER)
		?.match(CLIENT_HEADER_PATTERN);
	const product = match?.[1];
	const version = match?.[2];
	if (!product || !version) return null;
	return { product: product as ApiClientInfo["product"], version };
}

/**
 * Set when a request arrived over a transport only agents use — today that is
 * the MCP server, which `packages/mcp` marks when it builds its caller.
 * Derived from the transport, never from the request body, so it is safe to
 * attribute a write to an agent on the strength of it.
 *
 * Deliberately NOT set for the CLI. `superset` authenticates with the user's
 * own OAuth bearer or API key, identically whether a human typed the command
 * or an agent running in a pane did — the server cannot tell those apart. A
 * CLI agent self-reports instead (see `agentSessionId` on the page-comment
 * reply input), which is a hint, not an attestation. Don't treat the absence
 * of `agentCaller` as proof a human is calling.
 */
export type AgentCaller = { transport: "mcp"; label: string | null };

export type TRPCContext = {
	session: Session | null;
	auth: typeof auth;
	headers: Headers;
	client: ApiClientInfo | null;
	agentCaller: AgentCaller | null;
};

export const createTRPCContext = (
	opts: Omit<TRPCContext, "client" | "agentCaller"> & {
		agentCaller?: AgentCaller | null;
	},
): TRPCContext => ({
	...opts,
	client: parseClientHeader(opts.headers),
	agentCaller: opts.agentCaller ?? null,
});

const t = initTRPC.context<TRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return formatError({ shape, error });
	},
});

export const createTRPCRouter = t.router;

export const createCallerFactory = t.createCallerFactory;

const API_CALL_SAMPLE_RATE = 0.01;

// Per-procedure, per-client-version usage telemetry: the evidence source for
// deprecating procedures once no in-window client version still calls them.
function captureApiCall(
	client: ApiClientInfo | null,
	distinctId: string,
	path: string,
) {
	if (!client || Math.random() >= API_CALL_SAMPLE_RATE) return;
	posthog.capture({
		distinctId,
		event: "api_procedure_called",
		properties: {
			procedure: path,
			client_product: client.product,
			client_version: client.version,
		},
	});
}

const clientTelemetry = t.middleware(async ({ ctx, path, next }) => {
	captureApiCall(
		ctx.client,
		ctx.session?.user.id ?? "api-unauthenticated",
		path,
	);
	return next();
});

export const publicProcedure = t.procedure.use(clientTelemetry);

/** The only procedures a pending-deletion account may call. */
const PENDING_DELETION_ALLOWED_PROCEDURES = new Set([
	"user.me",
	"user.deleteAccount",
	"user.reactivateAccount",
]);

export const protectedProcedure = t.procedure
	.use(clientTelemetry)
	.use(async ({ ctx, next }) => {
		if (!ctx.session) {
			throw userError({
				code: "UNAUTHORIZED",
				message: "Not authenticated. Please sign in.",
				i18nKey: "serverError.common.notAuthenticatedPleaseSignIn",
			});
		}

		return next({ ctx: { ...ctx, session: ctx.session } });
	})
	.use(async ({ ctx, path, next }) => {
		if (
			ctx.session.user.deletionRequestedAt &&
			!PENDING_DELETION_ALLOWED_PROCEDURES.has(path)
		) {
			throw userError({
				code: "FORBIDDEN",
				message: "Account is pending deletion.",
				i18nKey: "serverError.common.accountIsPendingDeletion",
			});
		}
		return next();
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

		return next({ ctx: { ...ctx, activeOrganizationId } });
	});

function resolveActiveOrganizationId(
	organizationIds: string[],
	requestedOrganizationId: string | null,
): string | null {
	if (!requestedOrganizationId) {
		return organizationIds[0] ?? null;
	}

	if (!organizationIds.includes(requestedOrganizationId)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Not a member of organization ${requestedOrganizationId}`,
		});
	}

	return requestedOrganizationId;
}

export const jwtProcedure = t.procedure
	.use(async ({ ctx, next }) => {
		const authHeader = ctx.headers.get("authorization");
		const bearer = authHeader?.startsWith("Bearer ")
			? authHeader.slice(7)
			: null;
		const headerOrgId = ctx.headers.get(ORGANIZATION_HEADER)?.trim() || null;

		if (bearer) {
			try {
				const { payload } = await ctx.auth.api.verifyJWT({
					body: { token: bearer },
				});
				if (payload?.sub) {
					const organizationIds = Array.isArray(payload.organizationIds)
						? payload.organizationIds.filter(
								(id): id is string => typeof id === "string",
							)
						: [];
					return next({
						ctx: {
							userId: payload.sub,
							email: (payload.email as string) ?? "",
							organizationIds,
							activeOrganizationId: resolveActiveOrganizationId(
								organizationIds,
								headerOrgId,
							),
						},
					});
				}
			} catch (error) {
				// A live session is the legit fallback for an unverifiable token
				// (expired/missing). A TRPCError from verifyJWT is an explicit
				// rejection (revoked/forged) — surface it instead of laundering
				// it into session auth.
				if (error instanceof TRPCError) throw error;
			}
		}

		if (ctx.session) {
			const userId = ctx.session.user.id;
			const memberRows = await db.query.members.findMany({
				where: eq(members.userId, userId),
				columns: { organizationId: true },
			});
			const organizationIds = memberRows.map((row) => row.organizationId);
			return next({
				ctx: {
					userId,
					email: ctx.session.user.email ?? "",
					organizationIds,
					activeOrganizationId: headerOrgId
						? resolveActiveOrganizationId(organizationIds, headerOrgId)
						: (ctx.session.session.activeOrganizationId ??
							organizationIds[0] ??
							null),
				},
			});
		}

		throw userError({
			code: "UNAUTHORIZED",
			message:
				"Not authenticated. Provide a bearer JWT, x-api-key, or session.",
			i18nKey: "serverError.common.notAuthenticatedProvideABearerJwt",
		});
	})
	.use(async ({ ctx, path, next }) => {
		captureApiCall(ctx.client, ctx.userId, path);
		return next();
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
