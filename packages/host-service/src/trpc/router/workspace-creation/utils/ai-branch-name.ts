import { generateTitleFromMessage } from "@superset/chat/server/desktop";
import { getSmallModel } from "@superset/chat/server/shared";
import { deduplicateBranchName } from "./sanitize-branch";

const BRANCH_NAME_INSTRUCTIONS =
	"Generate a concise git branch name (2-4 words, kebab-case, descriptive, 20 characters or less). Return ONLY the branch name, nothing else.";

const MAX_BRANCH_LENGTH = 100;

/**
 * Light sanitizer for AI-generated branch names — lowercase, kebab-case,
 * restricted character set. Differs from desktop's full sanitizer: no
 * multi-segment support (AI generates a single segment) and no preserve-case
 * options.
 */
function sanitizeGeneratedBranchName(raw: string): string {
	return raw
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9._+@-]/g, "")
		.replace(/\.{2,}/g, ".")
		.replace(/-+/g, "-")
		.replace(/\.lock$/g, "")
		.slice(0, MAX_BRANCH_LENGTH)
		.replace(/^[-.]+|[-.]+$/g, "");
}

export async function generateBranchNameFromPrompt(
	prompt: string,
	existingBranches: string[],
): Promise<string | null> {
	const model = await getSmallModel();
	if (!model) return null;

	let generated: string | null;
	try {
		generated = await generateTitleFromMessage({
			message: prompt,
			agentModel: model,
			agentId: "branch-namer",
			agentName: "Branch Namer",
			instructions: BRANCH_NAME_INSTRUCTIONS,
			tracingContext: { surface: "host-service-branch-name" },
		});
	} catch (error) {
		console.warn("[generateBranchNameFromPrompt] generation failed:", error);
		return null;
	}

	if (!generated) return null;
	const sanitized = sanitizeGeneratedBranchName(generated);
	if (!sanitized) return null;
	return deduplicateBranchName(sanitized, existingBranches);
}
