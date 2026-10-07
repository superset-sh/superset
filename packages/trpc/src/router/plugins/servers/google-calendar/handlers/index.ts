import { failure } from "../api";
import type { Handler, ToolResult } from "../types";
import { availabilityHandlers } from "./availability";
import { calendarHandlers } from "./calendars";
import { eventHandlers } from "./events";

const HANDLERS: Record<string, Handler> = {
	...calendarHandlers,
	...eventHandlers,
	...availabilityHandlers,
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
