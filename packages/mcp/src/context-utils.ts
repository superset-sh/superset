import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
	ServerNotification,
	ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { type McpContext, McpUnauthorizedError } from "./auth";

export type McpRequestExtra = RequestHandlerExtra<
	ServerRequest,
	ServerNotification
> & {
	authInfo?: AuthInfo & { extra?: { mcpContext?: McpContext } };
};

export function getMcpContextFromExtra(extra: McpRequestExtra): McpContext {
	const ctx = extra.authInfo?.extra?.mcpContext;
	if (!ctx) {
		throw new McpUnauthorizedError("Missing MCP auth context");
	}
	return ctx;
}
