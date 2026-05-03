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

export interface McpToolCallEvent {
	toolName: string;
	userId: string;
	organizationId: string;
	source: "api-key" | "oauth";
	clientLabel: string | null;
	durationMs: number;
	success: boolean;
	errorMessage?: string;
}

export type McpToolCallEmitter = (event: McpToolCallEvent) => void;

const SERVER_EMITTERS = new WeakMap<McpServer, McpToolCallEmitter>();

export function setServerToolCallEmitter(
	server: McpServer,
	emitter: McpToolCallEmitter | undefined,
): void {
	if (emitter) {
		SERVER_EMITTERS.set(server, emitter);
	} else {
		SERVER_EMITTERS.delete(server);
	}
}

function emitToolCall(server: McpServer, event: McpToolCallEvent): void {
	const emitter = SERVER_EMITTERS.get(server);
	if (!emitter) return;
	try {
		emitter(event);
	} catch (e) {
		console.error("[mcp-v2] tool-call emitter threw:", e);
	}
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
			inputSchema: (def.inputSchema ?? {}) as Input,
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

			const startedAt = Date.now();
			try {
				const result = await def.handler(args, ctx);
				emitToolCall(server, {
					toolName: def.name,
					userId: ctx.userId,
					organizationId: ctx.organizationId,
					source: ctx.source,
					clientLabel: ctx.clientLabel,
					durationMs: Date.now() - startedAt,
					success: true,
				});
				return successResult(result);
			} catch (e) {
				const errorMessage = describeError(e);
				emitToolCall(server, {
					toolName: def.name,
					userId: ctx.userId,
					organizationId: ctx.organizationId,
					source: ctx.source,
					clientLabel: ctx.clientLabel,
					durationMs: Date.now() - startedAt,
					success: false,
					errorMessage: errorMessage.slice(0, 500),
				});
				return errorResult(errorMessage);
			}
		}) as never,
	);
}
