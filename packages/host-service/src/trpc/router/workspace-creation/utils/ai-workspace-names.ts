import { generateObjectFromMessage } from "@superset/chat/server/desktop";
import { getSmallModel } from "@superset/chat/server/shared";
import { z } from "zod";

const WORKSPACE_TITLE_MAX = 40;
const BRANCH_NAME_MAX = 25;

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

function trimTitle(raw: string): string {
	return raw.trim().replace(/[\s.,;:!?-]+$/g, "");
}

// Transforms run inside zod parse so model overshoots are coerced into
// shape rather than rejected — otherwise a 26-char branch or a 41-char
// title would silently no-op the whole rename.
const workspaceNamesSchema = z.object({
	title: z
		.string()
		.transform(trimTitle)
		.pipe(z.string().min(1))
		.describe(
			`Short human-readable workspace title. Up to ${WORKSPACE_TITLE_MAX} characters. No trailing punctuation. Prefer whole words; never truncate mid-word.`,
		),
	branchName: z
		.string()
		.transform(sanitizeBranchCandidate)
		.pipe(z.string().min(1))
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

/**
 * Generates both a workspace title and a git branch name from a prompt
 * using a single structured-output LLM call. Shares the same credentials
 * path as `generateTitleFromMessage` (small model via `getSmallModel`).
 */
export async function generateWorkspaceNamesFromPrompt(
	prompt: string,
): Promise<GeneratedWorkspaceNames | null> {
	const cleaned = prompt.trim();
	if (!cleaned) return null;

	const model = await getSmallModel();
	if (!model) return null;

	try {
		return await generateObjectFromMessage({
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
}
