import { failure } from "../api";
import type { Handler, ToolResult } from "../types";
import { draftHandlers } from "./drafts";
import { filterHandlers } from "./filters";
import { labelHandlers } from "./labels";
import { messageHandlers } from "./messages";
import { threadHandlers } from "./threads";

const HANDLERS: Record<string, Handler> = {
	...messageHandlers,
	...draftHandlers,
	...threadHandlers,
	...labelHandlers,
	...filterHandlers,
};

export async function callTool(
	name: string,
	args: Record<string, unknown>,
	accessToken: string | undefined,
): Promise<ToolResult> {
	if (!accessToken) return failure("Not connected; connect the plugin first.");

	const handler = Object.hasOwn(HANDLERS, name) ? HANDLERS[name] : undefined;
	if (!handler) return failure(`Unknown tool: ${name}`);

	try {
		return await handler(args, accessToken);
	} catch (error) {
		return failure(
			`Error: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
