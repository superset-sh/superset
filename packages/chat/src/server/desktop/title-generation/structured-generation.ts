import type { z } from "zod";

type StructuredModel = unknown;
type StructuredAgent = {
	generate: (
		message: string,
		options: {
			structuredOutput: {
				schema: unknown;
				jsonPromptInjection?: boolean;
			};
			tracingContext?: Record<string, unknown>;
		},
	) => Promise<{ object?: unknown }>;
};
type StructuredAgentCtor = new (options: {
	id: string;
	name: string;
	instructions: string;
	model: StructuredModel;
}) => StructuredAgent;

export interface GenerateObjectFromMessageParams<T> {
	message: string;
	agentModel: StructuredModel;
	schema: z.ZodType<T>;
	agentId?: string;
	agentName?: string;
	instructions?: string;
	tracingContext?: Record<string, unknown>;
	/**
	 * Force system-prompt-based JSON coercion instead of native
	 * response_format / tool-use. Safer for Claude-via-OAuth where
	 * native structured output may not be available.
	 */
	jsonPromptInjection?: boolean;
}

export async function generateObjectFromMessage<T>(
	params: GenerateObjectFromMessageParams<T>,
): Promise<T | null> {
	const cleanedMessage = params.message.trim();
	if (!cleanedMessage) return null;

	const agentModuleId = "@mastra/core/agent";
	const { Agent } = (await import(agentModuleId)) as {
		Agent?: StructuredAgentCtor;
	};
	if (!Agent) {
		throw new Error("Mastra Agent constructor is unavailable");
	}

	const agent = new Agent({
		id: params.agentId ?? "structured-generator",
		name: params.agentName ?? "Structured Generator",
		instructions: params.instructions ?? "You generate structured objects.",
		model: params.agentModel,
	});

	const result = await agent.generate(cleanedMessage, {
		structuredOutput: {
			schema: params.schema,
			jsonPromptInjection: params.jsonPromptInjection ?? true,
		},
		tracingContext: params.tracingContext ?? {},
	});

	const object = result?.object;
	if (object == null) return null;
	const parsed = params.schema.safeParse(object);
	return parsed.success ? parsed.data : null;
}
