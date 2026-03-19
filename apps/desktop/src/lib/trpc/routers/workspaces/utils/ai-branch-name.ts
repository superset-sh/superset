import {
	generateTitleFromMessage,
	generateTitleFromMessageWithStreamingModel,
} from "@superset/chat/server/desktop";
import { callSmallModel } from "lib/ai/call-small-model";
import { sanitizeBranchNameWithMaxLength } from "shared/utils/branch";

/**
 * Checks if a branch name conflicts with existing branches (case-insensitive)
 */
function hasConflict(branchName: string, existingBranches: string[]): boolean {
	const lowerName = branchName.toLowerCase();
	return existingBranches.some((b) => b.toLowerCase() === lowerName);
}

/**
 * Resolves branch name conflicts by appending a number (-2, -3, etc.)
 */
function resolveConflict(
	baseName: string,
	existingBranches: string[],
): string {
	if (!hasConflict(baseName, existingBranches)) {
		return baseName;
	}

	let counter = 2;
	let candidate = `${baseName}-${counter}`;

	while (hasConflict(candidate, existingBranches)) {
		counter++;
		candidate = `${baseName}-${counter}`;
	}

	return candidate;
}

export async function generateBranchNameFromPrompt(
	prompt: string,
	existingBranches: string[] = [],
): Promise<string | null> {
	const { result } = await callSmallModel<string>({
		invoke: async ({ credentials, providerId, providerName, model }) => {
			if (providerId === "openai" && credentials.kind === "oauth") {
				return generateTitleFromMessageWithStreamingModel({
					message: prompt,
					model: model as never,
					instructions:
						"Generate a concise git branch name (2-4 words, kebab-case, descriptive). Return ONLY the branch name, nothing else.",
				});
			}

			return generateTitleFromMessage({
				message: prompt,
				agentModel: model,
				agentId: `branch-namer-${providerId}`,
				agentName: "Branch Namer",
				instructions:
					"Generate a concise git branch name (2-4 words, kebab-case, descriptive). Return ONLY the branch name, nothing else.",
				tracingContext: {
					surface: "workspace-branch-name",
					provider: providerName,
				},
			});
		},
	});

	if (result !== null && result !== undefined) {
		const sanitized = sanitizeBranchNameWithMaxLength(result);
		if (sanitized) {
			// Resolve any conflicts with existing branches
			return resolveConflict(sanitized, existingBranches);
		}
	}

	return null;
}
