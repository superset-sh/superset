import { env } from "../env";

export const VALID_OAUTH_AUDIENCES = [
	env.NEXT_PUBLIC_API_URL,
	`${env.NEXT_PUBLIC_API_URL}/`,
	`${env.NEXT_PUBLIC_API_URL}/api/agent/mcp`,
	`${env.NEXT_PUBLIC_API_URL}/api/v2/agent/mcp`,
];
