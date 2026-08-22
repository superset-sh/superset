import Anthropic from "@anthropic-ai/sdk";
import { deriveWorkspaceTitleFromPrompt } from "@superset/shared/workspace-launch";
import { env } from "../../env";

/** Same instruction the local host names with, so both paths read alike. */
const INSTRUCTIONS =
	"You generate concise workspace titles. 20 characters or less. Write the title in the same language as the user's message. Return ONLY the title, nothing else.";

const MAX_PROMPT_CHARS = 4000;

/**
 * Names a cloud workspace from its prompt. The local path names on the device
 * using the user's own model credentials; a cloud workspace is created by the
 * API, which has none, so naming has to happen here or not at all.
 */
export async function generateCloudWorkspaceName(
	prompt: string,
): Promise<string | null> {
	const cleaned = prompt.replace(/\s+/g, " ").trim();
	if (!cleaned) return null;

	try {
		const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
		const response = await anthropic.messages.create({
			model: "claude-haiku-4-5",
			max_tokens: 64,
			system: INSTRUCTIONS,
			messages: [{ role: "user", content: cleaned.slice(0, MAX_PROMPT_CHARS) }],
		});
		const generated = response.content
			.find((block): block is Anthropic.TextBlock => block.type === "text")
			?.text.replace(/\s+/g, " ")
			.replace(/^["']|["']$/g, "")
			.trim();
		if (generated) return generated.slice(0, 60);
	} catch (error) {
		console.error("[cloud-workspace] name generation failed", error);
	}

	return deriveWorkspaceTitleFromPrompt(cleaned) || null;
}
