import { Agent } from "@mastra/core/agent";

type TitleAgent = Pick<Agent, "generateTitleFromUserMessage">;
type TitleModel = ConstructorParameters<typeof Agent>[0]["model"];

type GenerateTitleFromMessageParams =
	| {
			message: string;
			agent: TitleAgent;
			modelId: string;
			tracingContext?: Record<string, unknown>;
	  }
	| {
			message: string;
			agentModel: TitleModel;
			agentId?: string;
			agentName?: string;
			instructions?: string;
			tracingContext?: Record<string, unknown>;
	  };

export async function generateTitleFromMessage(
	params: GenerateTitleFromMessageParams,
): Promise<string | null> {
	const { message, tracingContext = {} } = params;
	const cleanedMessage = message.trim();
	if (!cleanedMessage) {
		return null;
	}

	if ("agent" in params) {
		const title = await params.agent.generateTitleFromUserMessage({
			message: cleanedMessage,
			model: params.modelId,
			tracingContext,
		});
		return title?.trim() || null;
	}

	const titleAgent = new Agent({
		id: params.agentId ?? "title-generator",
		name: params.agentName ?? "Title Generator",
		instructions: params.instructions ?? "You generate concise titles.",
		model: params.agentModel,
	});

	const title = await titleAgent.generateTitleFromUserMessage({
		message: cleanedMessage,
		tracingContext,
	});

	return title?.trim() || null;
}
