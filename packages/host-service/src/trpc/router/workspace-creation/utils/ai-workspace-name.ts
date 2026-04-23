import { generateTitleFromMessage } from "@superset/chat/server/desktop";
import { getSmallModel } from "@superset/chat/server/shared";

const WORKSPACE_NAME_INSTRUCTIONS =
	"You generate concise workspace titles. 20 characters or less. Return ONLY the title, nothing else.";

const MAX_WORKSPACE_NAME_LENGTH = 20;

export async function generateWorkspaceNameFromPrompt(
	prompt: string,
): Promise<string | null> {
	const cleaned = prompt.trim();
	if (!cleaned) return null;

	const model = await getSmallModel();
	if (!model) return null;

	let generated: string | null;
	try {
		generated = await generateTitleFromMessage({
			message: cleaned,
			agentModel: model,
			agentId: "workspace-namer",
			agentName: "Workspace Namer",
			instructions: WORKSPACE_NAME_INSTRUCTIONS,
			tracingContext: { surface: "host-service-workspace-name" },
		});
	} catch (error) {
		console.warn("[generateWorkspaceNameFromPrompt] generation failed:", error);
		return null;
	}

	const trimmed = generated?.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, MAX_WORKSPACE_NAME_LENGTH);
}
