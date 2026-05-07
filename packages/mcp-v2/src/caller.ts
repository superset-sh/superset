import { auth } from "@superset/auth/server";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import { createCaller as makeAppCaller } from "@superset/trpc";
import type { McpContext } from "./auth";

export type McpCaller = ReturnType<typeof makeAppCaller>;

/**
 * Build a tRPC server-side caller for the AppRouter scoped to an MCP context.
 *
 * The bearer token + org header pair is enough — `authenticatedProcedure`
 * runs `resolveBearerAuth` against these headers and produces the flat ctx
 * shape directly. No synthetic Session needed.
 */
export function createMcpCaller(ctx: McpContext): McpCaller {
	const headers = new Headers();
	headers.set("authorization", `Bearer ${ctx.bearerToken}`);
	headers.set(ORGANIZATION_HEADER, ctx.organizationId);

	return makeAppCaller({ auth, headers });
}
