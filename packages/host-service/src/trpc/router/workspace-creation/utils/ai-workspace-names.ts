import { generateObjectFromMessage } from "@superset/chat/server/desktop";
import { getSmallModel } from "@superset/chat/server/shared";
import { z } from "zod";

const WORKSPACE_TITLE_MAX = 40;
const BRANCH_NAME_MAX = 25;

const workspaceNamesSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1)
		.max(WORKSPACE_TITLE_MAX)
		.describe(
			`Short human-readable workspace title. Up to ${WORKSPACE_TITLE_MAX} characters. No trailing punctuation. Prefer whole words; never truncate mid-word.`,
		),
	branchName: z
		.string()
		.trim()
		.min(1)
		.max(BRANCH_NAME_MAX)
		.describe(
			`Git branch name in kebab-case (lowercase, dashes). 2-4 words, up to ${BRANCH_NAME_MAX} characters. Only [a-z0-9-]. No leading/trailing dashes. No prefixes.`,
		),
});

export type GeneratedWorkspaceNames = z.infer<typeof workspaceNamesSchema>;

const INSTRUCTIONS = [
	"You name new code workspaces from the user's initial prompt.",
	"Return a structured object with two fields:",
	`- title: a short human-readable label (<= ${WORKSPACE_TITLE_MAX} chars). Full words only; never cut mid-word. No trailing punctuation.`,
	`- branchName: a kebab-case git branch name (<= ${BRANCH_NAME_MAX} chars, 2-4 words). Only a-z 0-9 and dashes. No prefixes.`,
	"Both fields must describe the same underlying task; the branch is just a compact slug of the title.",
].join("\n");

function sanitizeBranchCandidate(raw: string): string {
	return raw
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, BRANCH_NAME_MAX)
		.replace(/-+$/g, "");
}

/**
 * Generates both a workspace title and a git branch name from a prompt
 * using a single structured-output LLM call. Shares the same credentials
 * path as `generateTitleFromMessage` (small model via `getSmallModel`).
 *
 * Title is returned verbatim (no post-trim) so the model decides word
 * boundaries — `generateObjectFromMessage` already drops it if the
 * model overshoots the zod `.max()`. Branch is lightly sanitized to
 * enforce git-ref shape without changing semantics.
 */
export async function generateWorkspaceNamesFromPrompt(
	prompt: string,
): Promise<GeneratedWorkspaceNames | null> {
	const cleaned = prompt.trim();
	if (!cleaned) return null;

	const model = await getSmallModel();
	if (!model) return null;

	let result: GeneratedWorkspaceNames | null;
	try {
		result = await generateObjectFromMessage({
			message: cleaned,
			agentModel: model,
			agentId: "workspace-namer",
			agentName: "Workspace Namer",
			instructions: INSTRUCTIONS,
			schema: workspaceNamesSchema,
			tracingContext: { surface: "host-service-workspace-names" },
		});
	} catch (error) {
		console.warn(
			"[generateWorkspaceNamesFromPrompt] generation failed:",
			error,
		);
		return null;
	}
	if (!result) return null;

	const branchName = sanitizeBranchCandidate(result.branchName);
	if (!branchName) return null;
	const title = result.title.trim();
	if (!title) return null;

	return { title, branchName };
}
