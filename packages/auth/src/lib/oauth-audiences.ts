import { env } from "../env";

const apiUrl = env.NEXT_PUBLIC_API_URL;

/** Audiences accepted on general API (tRPC) routes. */
export const TRPC_AUDIENCES = [apiUrl, `${apiUrl}/`];

/** Audiences accepted on MCP routes — tRPC's plus MCP-specific paths. */
export const MCP_AUDIENCES = [
	...TRPC_AUDIENCES,
	`${apiUrl}/api/agent/mcp`,
	`${apiUrl}/api/v2/agent/mcp`,
];

/**
 * Resource indicators the OAuth provider is allowed to mint tokens for.
 * Equals the MCP set since MCP accepts the broadest audience.
 */
export const VALID_OAUTH_AUDIENCES = MCP_AUDIENCES;
