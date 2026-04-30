import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape, z } from "zod";
import { isMcpUnauthorized, type McpContext } from "./auth";
import { getMcpContextFromExtra, type McpRequestExtra } from "./context-utils";

export interface ToolDef<
	Input extends ZodRawShape,
	Output extends ZodRawShape,
> {
	name: string;
	description: string;
	inputSchema?: Input;
	outputSchema?: Output;
	handler: (
		input: z.infer<z.ZodObject<Input>>,
		ctx: McpContext,
	) => Promise<unknown>;
}

function errorResult(message: string): CallToolResult {
	return {
		isError: true,
		content: [
			{
				type: "text" as const,
				text: message,
			},
		],
	};
}

function successResult(data: unknown): CallToolResult {
	return {
		structuredContent:
			data && typeof data === "object" && !Array.isArray(data)
				? (data as Record<string, unknown>)
				: { result: data },
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(data, null, 2),
			},
		],
	};
}

function describeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

export function defineTool<
	Input extends ZodRawShape,
	Output extends ZodRawShape,
>(server: McpServer, def: ToolDef<Input, Output>): void {
	server.registerTool(
		def.name,
		{
			description: def.description,
			...(def.inputSchema ? { inputSchema: def.inputSchema } : {}),
			...(def.outputSchema ? { outputSchema: def.outputSchema } : {}),
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the SDK callback type depends on whether inputSchema is provided; we always invoke with two args.
		(async (args: z.infer<z.ZodObject<Input>>, extra: McpRequestExtra) => {
			let ctx: McpContext;
			try {
				ctx = getMcpContextFromExtra(extra);
			} catch (e) {
				if (isMcpUnauthorized(e)) {
					return errorResult(`Unauthorized: ${e.message}`);
				}
				return errorResult(`Auth context unavailable: ${describeError(e)}`);
			}

			try {
				const result = await def.handler(args, ctx);
				return successResult(result);
			} catch (e) {
				return errorResult(describeError(e));
			}
		}) as never,
	);
}
