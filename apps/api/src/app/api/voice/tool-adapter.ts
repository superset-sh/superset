import type Anthropic from "@anthropic-ai/sdk";
import type { McpContext } from "@superset/mcp/auth";
import { z } from "zod";

type ToolHandler = (
	params: Record<string, unknown>,
	ctx: McpContext,
) => Promise<{
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
}>;

interface ToolDefinition {
	name: string;
	description: string;
	input_schema: Anthropic.Tool["input_schema"];
	handler: ToolHandler;
}

let cachedTools: ToolDefinition[] | null = null;

/**
 * Builds tool definitions by intercepting MCP tool registration.
 * Converts Zod input schemas to JSON Schema for the Anthropic SDK.
 * Results are cached since tool definitions are static.
 */
export async function getToolDefinitions(): Promise<ToolDefinition[]> {
	if (cachedTools) return cachedTools;

	const tools: ToolDefinition[] = [];

	const interceptServer = {
		tool(
			name: string,
			description: string,
			inputSchema: Record<string, z.ZodType>,
			handler: (
				params: Record<string, unknown>,
				extra: {
					authInfo?: { extra?: { mcpContext?: McpContext } };
				},
			) => Promise<{
				content: Array<{ type: "text"; text: string }>;
				isError?: boolean;
			}>,
		) {
			// Convert Zod schemas to JSON Schema properties
			const properties: Record<string, unknown> = {};
			const required: string[] = [];

			for (const [key, schema] of Object.entries(inputSchema)) {
				try {
					properties[key] = zodToJsonSchema(schema);
					if (!isOptional(schema)) {
						required.push(key);
					}
				} catch {
					// Fallback for schemas that can't be converted
					properties[key] = { type: "string" };
				}
			}

			tools.push({
				name,
				description,
				input_schema: {
					type: "object" as const,
					properties,
					...(required.length > 0 ? { required } : {}),
				},
				handler: async (params, ctx) => {
					return handler(params, {
						authInfo: { extra: { mcpContext: ctx } },
					});
				},
			});
		},
	};

	const { registerTools } = await import("@superset/mcp");
	registerTools(interceptServer as never);

	cachedTools = tools;
	return tools;
}

/**
 * Convert a Zod schema to a basic JSON Schema representation.
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
	const def = (
		schema as unknown as {
			_zod?: { def?: { type?: string; typeName?: string } };
		}
	)._zod?.def;
	const description = schema.description;

	// Unwrap optional/default wrappers
	const innerSchema = unwrapZod(schema);
	const innerDef = (
		innerSchema as unknown as { _zod?: { def?: Record<string, unknown> } }
	)._zod?.def;
	const typeName = (innerDef?.typeName ??
		def?.type ??
		def?.typeName ??
		"") as string;

	const result: Record<string, unknown> = {};

	switch (typeName) {
		case "ZodString":
		case "string":
			result.type = "string";
			break;
		case "ZodNumber":
		case "number":
			result.type = "number";
			break;
		case "ZodBoolean":
		case "boolean":
			result.type = "boolean";
			break;
		case "ZodArray":
		case "array": {
			result.type = "array";
			const itemSchema =
				(innerDef as Record<string, unknown>)?.innerType ??
				(innerDef as Record<string, unknown>)?.type;
			if (itemSchema && itemSchema instanceof z.ZodType) {
				result.items = zodToJsonSchema(itemSchema);
			}
			break;
		}
		case "ZodEnum":
		case "enum": {
			result.type = "string";
			const values =
				(innerDef as Record<string, unknown>)?.entries ??
				(innerDef as Record<string, unknown>)?.values;
			if (Array.isArray(values)) {
				result.enum = values;
			} else if (values && typeof values === "object") {
				result.enum = Object.keys(values);
			}
			break;
		}
		case "ZodObject":
		case "object": {
			result.type = "object";
			const shape = (innerDef as Record<string, unknown>)?.shape;
			if (shape && typeof shape === "object") {
				const props: Record<string, unknown> = {};
				for (const [k, v] of Object.entries(
					shape as Record<string, z.ZodType>,
				)) {
					props[k] = zodToJsonSchema(v);
				}
				result.properties = props;
			}
			break;
		}
		default:
			result.type = "string";
			break;
	}

	if (description) {
		result.description = description;
	}

	return result;
}

/**
 * Unwrap optional/default/nullable wrappers to get the inner type.
 */
function unwrapZod(schema: z.ZodType): z.ZodType {
	const def = (
		schema as unknown as { _zod?: { def?: Record<string, unknown> } }
	)._zod?.def;
	const typeName = (def?.typeName ?? "") as string;

	if (
		typeName === "ZodOptional" ||
		typeName === "ZodDefault" ||
		typeName === "ZodNullable"
	) {
		const inner = def?.innerType;
		if (inner && inner instanceof z.ZodType) {
			return unwrapZod(inner);
		}
	}

	return schema;
}

/**
 * Check if a Zod schema is optional.
 */
function isOptional(schema: z.ZodType): boolean {
	const def = (
		schema as unknown as { _zod?: { def?: Record<string, unknown> } }
	)._zod?.def;
	const typeName = (def?.typeName ?? "") as string;

	if (typeName === "ZodOptional" || typeName === "ZodDefault") {
		return true;
	}

	const inner = def?.innerType;
	if (inner && inner instanceof z.ZodType) {
		return isOptional(inner);
	}

	return false;
}

/**
 * Execute a tool by name with the given input and auth context.
 */
export async function executeTool({
	toolName,
	toolInput,
	ctx,
	tools,
}: {
	toolName: string;
	toolInput: Record<string, unknown>;
	ctx: McpContext;
	tools: ToolDefinition[];
}): Promise<string> {
	const tool = tools.find((t) => t.name === toolName);
	if (!tool) {
		return JSON.stringify({ error: `Unknown tool: ${toolName}` });
	}

	try {
		const result = await tool.handler(toolInput, ctx);
		const text = result.content.map((c) => c.text).join("\n");
		return text;
	} catch (error) {
		console.error(`[voice/tool] Error executing ${toolName}:`, error);
		return JSON.stringify({
			error: `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		});
	}
}

/**
 * Convert tool definitions to Anthropic SDK tool format.
 */
export function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
	return tools.map((t) => ({
		name: t.name,
		description: t.description,
		input_schema: t.input_schema,
	}));
}
