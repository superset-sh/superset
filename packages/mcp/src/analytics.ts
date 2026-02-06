import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
	ServerNotification,
	ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { PostHog } from "posthog-node";
import type { McpContext } from "./auth";

const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

const posthog = apiKey
	? new PostHog(apiKey, {
			host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
		})
	: null;

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification> & {
	authInfo?: AuthInfo & {
		extra?: { mcpContext?: McpContext };
		clientId?: string;
	};
};

export function trackToolCall({
	toolName,
	extra,
}: {
	toolName: string;
	extra: RequestHandlerExtra<ServerRequest, ServerNotification>;
}) {
	if (!posthog) return;

	const typed = extra as ToolExtra;
	const ctx = typed.authInfo?.extra?.mcpContext;
	if (!ctx) return;

	posthog.capture({
		distinctId: ctx.userId,
		event: "mcp_tool_called",
		properties: {
			tool: toolName,
			source: typed.authInfo?.clientId ?? "unknown",
			organization_id: ctx.organizationId,
			app_name: "mcp",
		},
	});
}
