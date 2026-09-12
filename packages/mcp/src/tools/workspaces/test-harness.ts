import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { type ZodRawShape, z } from "zod";
import type { McpContext } from "../../auth";

/**
 * Test double for `defineTool` and `hostServiceCall`.
 *
 * The real `defineTool` reaches the database client through the MCP auth
 * module, which needs credentials these tools never use. Mocking that seam
 * keeps the tests to what the tool files themselves decide: the declared
 * schema, the input the handler builds for the host, and the errors it raises
 * after the host returns.
 */
export interface CapturedTool {
	name: string;
	annotations?: ToolAnnotations;
	description: string;
	inputSchema: ZodRawShape;
	handler: (input: unknown, ctx: McpContext) => Promise<unknown>;
}

export interface CapturedCall {
	procedure: string;
	method: string;
	input: unknown;
	hostId: string;
}

const CTX = {
	relayUrl: "https://relay.test",
	organizationId: "org-1",
	bearerToken: "bearer",
} as McpContext;

export function createHarness() {
	const tools: CapturedTool[] = [];
	const calls: CapturedCall[] = [];
	let response: unknown = {};
	let failure: Error | undefined;

	return {
		calls,
		setResponse(next: unknown) {
			response = next;
			failure = undefined;
		},
		setFailure(next: Error) {
			failure = next;
		},
		defineTool(_server: unknown, def: CapturedTool) {
			tools.push(def);
		},
		hostServiceCall(
			options: { hostId: string },
			procedure: string,
			method: string,
			input: unknown,
		) {
			calls.push({ procedure, method, input, hostId: options.hostId });
			return failure ? Promise.reject(failure) : Promise.resolve(response);
		},
		register(mod: { register: (server: McpServer) => void }): CapturedTool {
			tools.length = 0;
			mod.register({} as McpServer);
			const tool = tools[0];
			if (!tool) throw new Error("register() defined no tool");
			return tool;
		},
		invoke(tool: CapturedTool, input: Record<string, unknown>) {
			return tool.handler(z.object(tool.inputSchema).parse(input), CTX);
		},
	};
}
