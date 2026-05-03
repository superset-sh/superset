import { env } from "../env";

const apiUrl = env.NEXT_PUBLIC_API_URL;

/** Audiences accepted on general API (tRPC) routes. */
export const TRPC_AUDIENCES = [apiUrl, `${apiUrl}/`];

/** Audiences accepted on MCP routes (general API + MCP-specific paths). */
export const MCP_AUDIENCES = [
	apiUrl,
	`${apiUrl}/`,
	`${apiUrl}/api/agent/mcp`,
	`${apiUrl}/api/v2/agent/mcp`,
];

/**
 * The full set of resource indicators a client is allowed to request when
 * exchanging an OAuth code for a token. Used by the OAuth provider config —
 * NOT for verifying token audience at use time (use `TRPC_AUDIENCES` /
 * `MCP_AUDIENCES` per resource server).
 */
export const VALID_OAUTH_AUDIENCES = [
	...new Set([...TRPC_AUDIENCES, ...MCP_AUDIENCES]),
];
