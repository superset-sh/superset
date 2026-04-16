import { generateTitleFromMessage } from "@superset/chat/server/desktop";
import { getSmallModel } from "@superset/chat/server/shared";
import { sanitizeBranchNameWithMaxLength } from "shared/utils/branch";

const BRANCH_NAME_INSTRUCTIONS =
	"Generate a concise git branch name (2-4 words, kebab-case, descriptive). Return ONLY the branch name, nothing else.";
const MAX_CONFLICT_RESOLUTION_ATTEMPTS = 1000;
const INITIAL_CONFLICT_SUFFIX = 2;

function hasConflict(
	branchName: string,
	existingBranchesSet: Set<string>,
): boolean {
	return existingBranchesSet.has(branchName.toLowerCase());
}

function resolveConflict(
	baseName: string,
	existingBranches: string[],
	branchPrefix: string | undefined,
): string {
	const prefixedBase = branchPrefix ? `${branchPrefix}/${baseName}` : baseName;
	const lowerPrefixedBase = prefixedBase.toLowerCase();
	const hasInitialConflict = existingBranches.some(
		(b) => b.toLowerCase() === lowerPrefixedBase,
	);

	if (!hasInitialConflict) {
		return baseName;
	}

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

	return candidate;
}

export async function generateBranchNameFromPrompt(
	prompt: string,
	existingBranches: string[],
	branchPrefix?: string,
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
			tracingContext: { surface: "workspace-branch-name" },
		});
	} catch (error) {
		console.warn("[generateBranchNameFromPrompt] generation failed:", error);
		return null;
	}

	if (!generated) return null;
	const sanitized = sanitizeBranchNameWithMaxLength(generated);
	if (!sanitized) return null;
	return resolveConflict(sanitized, existingBranches, branchPrefix);
}
