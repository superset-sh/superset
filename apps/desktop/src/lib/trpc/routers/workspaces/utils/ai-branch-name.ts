import {
	generateTitleFromMessage,
	generateTitleFromMessageWithStreamingModel,
} from "@superset/chat/server/desktop";
import { callSmallModel } from "lib/ai/call-small-model";
import { sanitizeBranchNameWithMaxLength } from "shared/utils/branch";

const BRANCH_NAME_INSTRUCTIONS =
	"Generate a concise git branch name (2-4 words, kebab-case, descriptive). Return ONLY the branch name, nothing else.";
const MAX_CONFLICT_RESOLUTION_ATTEMPTS = 1000;
const INITIAL_CONFLICT_SUFFIX = 2; // Start at -2 since -1 is implicit (no suffix)

/**
 * Checks if a branch name conflicts with existing branches (case-insensitive)
 */
function hasConflict(
	branchName: string,
	existingBranchesSet: Set<string>,
): boolean {
	return existingBranchesSet.has(branchName.toLowerCase());
}

/**
 * Resolves branch name conflicts by appending a number (-2, -3, etc.)
 * IMPORTANT: Checks conflicts with prefix applied to match server behavior
 */
function resolveConflict(
	baseName: string,
	existingBranches: string[],
	branchPrefix: string | undefined,
): string {
	// Apply prefix to match what the server will do
	const prefixedBase = branchPrefix ? `${branchPrefix}/${baseName}` : baseName;

	// Quick check without creating Set (covers 90% of cases where no conflict exists)
	const lowerPrefixedBase = prefixedBase.toLowerCase();
	const hasInitialConflict = existingBranches.some(
		(b) => b.toLowerCase() === lowerPrefixedBase,
	);

	if (!hasInitialConflict) {
		return baseName; // Return unprefixed - server will apply prefix
	}

	// Only create Set if we need to loop through conflicts
	const existingSet = new Set(existingBranches.map((b) => b.toLowerCase()));

	let counter = INITIAL_CONFLICT_SUFFIX;
	let candidate = `${baseName}-${counter}`;
	let prefixedCandidate = branchPrefix
		? `${branchPrefix}/${candidate}`
		: candidate;

	while (hasConflict(prefixedCandidate, existingSet)) {
		counter++;
		if (counter > MAX_CONFLICT_RESOLUTION_ATTEMPTS) {
			throw new Error(
				`Could not find unique branch name after ${MAX_CONFLICT_RESOLUTION_ATTEMPTS} attempts`,
			);
		}
		candidate = `${baseName}-${counter}`;
		prefixedCandidate = branchPrefix
			? `${branchPrefix}/${candidate}`
			: candidate;
	}

	return candidate; // Return unprefixed - server will apply prefix
}

/**
 * Generates an AI-powered branch name from a user prompt with automatic conflict resolution.
 *
 * @param prompt - User's workspace description
 * @param existingBranches - List of existing branch names to check for conflicts
 * @param branchPrefix - Optional prefix that will be applied by the server (e.g., "avi")
 * @returns Generated branch name WITHOUT prefix (server will apply it) or null if generation fails
 * @throws Error if conflict resolution exceeds max attempts
 */
export async function generateBranchNameFromPrompt(
	prompt: string,
	existingBranches: string[],
	branchPrefix?: string,
): Promise<string | null> {
	const { result } = await callSmallModel<string>({
		invoke: async ({ credentials, providerId, providerName, model }) => {
			if (providerId === "openai" && credentials.kind === "oauth") {
				return generateTitleFromMessageWithStreamingModel({
					message: prompt,
					model: model as never,
					instructions: BRANCH_NAME_INSTRUCTIONS,
				});
			}

			return generateTitleFromMessage({
				message: prompt,
				agentModel: model,
				agentId: `branch-namer-${providerId}`,
				agentName: "Branch Namer",
				instructions: BRANCH_NAME_INSTRUCTIONS,
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
			// Resolve conflicts with prefix applied (matches server behavior)
			return resolveConflict(sanitized, existingBranches, branchPrefix);
		}
	}

	return null;
}
