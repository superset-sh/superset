import { failure } from "../api";
import type { Handler, ToolResult } from "../types";
import { budgetHandlers } from "./budget";
import { transactionHandlers } from "./transactions";

const HANDLERS: Record<string, Handler> = {
	...budgetHandlers,
	...transactionHandlers,
};

export async function callTool(
	name: string,
	args: Record<string, unknown>,
	token: string | undefined,
): Promise<ToolResult> {
	if (!token) return failure("Not connected; connect the plugin first.");

	const handler = Object.hasOwn(HANDLERS, name) ? HANDLERS[name] : undefined;
	if (!handler) return failure(`Unknown tool: ${name}`);

	try {
		return await handler(args, token);
	} catch (error) {
		return failure(
			`Error: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
