type TitleModel = unknown;
type TitleAgent = {
	generateTitleFromUserMessage: (args: {
		message: string;
		model?: string;
		tracingContext?: Record<string, unknown>;
	}) => Promise<string | null | undefined>;
};
type TitleAgentCtor = new (options: {
	id: string;
	name: string;
	instructions: string;
	model: TitleModel;
}) => TitleAgent;

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

	const agentModuleId = "@mastra/core/agent";
	const { Agent } = (await import(agentModuleId)) as {
		Agent?: TitleAgentCtor;
	};
	if (!Agent) {
		throw new Error("Mastra Agent constructor is unavailable");
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
