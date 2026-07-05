import { auth, type Session } from "@superset/auth/server";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import { createCaller as makeAppCaller } from "@superset/trpc";
import type { McpContext } from "./auth";

export type McpCaller = ReturnType<typeof makeAppCaller>;

/**
 * Build a tRPC server-side caller for the AppRouter scoped to an MCP context.
 *
 * Synthesizes the same shape `apps/api/src/trpc/context.ts` produces for HTTP
 * requests, so both `protectedProcedure` and `jwtProcedure` accept it:
 * - `session` carries `user.id` + `session.activeOrganizationId` for protected procs.
 * - `headers` carries the minted JWT in `Authorization` + the active org id in
 *   the `x-superset-organization-id` header so jwt procs verify and org-scoped
 *   middleware reads the right org.
 *
 * The minted JWT is reused across all calls in this request — the caller is
 * cheap to construct and tools call only one procedure each.
 */
export function createMcpCaller(ctx: McpContext): McpCaller {
	const headers = new Headers();
	headers.set("authorization", `Bearer ${ctx.bearerToken}`);
	headers.set(ORGANIZATION_HEADER, ctx.organizationId);

	const session = {
		user: {
			id: ctx.userId,
			email: ctx.email,
			emailVerified: true,
			name: ctx.email,
			image: null,
			createdAt: new Date(0),
			updatedAt: new Date(0),
		},
		session: {
			id: `mcp-v2-${ctx.requestId}`,
			userId: ctx.userId,
			activeOrganizationId: ctx.organizationId,
			organizationIds: ctx.organizationIds,
			expiresAt: new Date(Date.now() + 5 * 60_000),
			token: ctx.bearerToken,
			ipAddress: null,
			userAgent: "mcp-v2",
			createdAt: new Date(0),
			updatedAt: new Date(0),
		},
	} as unknown as Session;

	return makeAppCaller({
		session,
		auth,
		headers,
	});
}
