import { Agent } from "@mastra/core/agent";
import { getSmallModel } from "@superset/chat/server/shared";
import { z } from "zod";
import type { HostServiceContext } from "../../../../types";
import {
	markWorkspaceCloudSynced,
	updateLocalWorkspace,
} from "../../../../workspaces/local-workspace-store";
import { listBranchNames } from "./list-branch-names";
import { deduplicateBranchName } from "./sanitize-branch";

const WORKSPACE_TITLE_MAX = 150;
const BRANCH_NAME_MAX = 25;
const GENERATE_TIMEOUT_MS = 5_000;

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
	return raw
		.trim()
		.replace(/[\s.,;:!?-]+$/g, "")
		.slice(0, WORKSPACE_TITLE_MAX);
}

const workspaceNamesOutputSchema = z.object({
	title: z
		.string()
		.describe(
			`Short human-readable workspace title. Up to ${WORKSPACE_TITLE_MAX} characters. No trailing punctuation. Prefer whole words; never truncate mid-word.`,
		),
	branchName: z
		.string()
		.describe(
			`Git branch name in kebab-case (lowercase, dashes). 2-4 words, up to ${BRANCH_NAME_MAX} characters. Only [a-z0-9-]. No leading/trailing dashes. No prefixes.`,
		),
});

// Keep transforms out of the provider-facing schema: transformed Zod fields
// lose their JSON Schema type in the current converter, which Anthropic's
// native structured-output endpoint rejects. Coerce the validated response
// locally instead. Empty fields still fall through to the caller, which skips
// the respective rename step.
const workspaceNamesSchema = workspaceNamesOutputSchema.transform(
	({ title, branchName }) => ({
		title: trimTitle(title),
		branchName: sanitizeBranchCandidate(branchName),
	}),
);

export type GeneratedWorkspaceNames = z.infer<typeof workspaceNamesSchema>;

const INSTRUCTIONS = [
	"You name new code workspaces from the user's initial prompt.",
	"The prompt describes work to do in an existing repository. Name that work; do not answer the prompt, ask questions, or request more context. Always infer useful names, even when the prompt is vague.",
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

	const agent = new Agent({
		id: "workspace-namer",
		name: "Workspace Namer",
		instructions: INSTRUCTIONS,
		model,
	});

	try {
		const { object } = await Promise.race([
			agent.generate(cleaned, {
				structuredOutput: {
					schema: workspaceNamesOutputSchema,
				},
			}),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`timed out after ${GENERATE_TIMEOUT_MS}ms`)),
					GENERATE_TIMEOUT_MS,
				),
			),
		]);
		return workspaceNamesSchema.parse(object);
	} catch (error) {
		console.warn(
			"[generateWorkspaceNamesFromPrompt] generation failed:",
			error,
		);
		return null;
	}
}

interface ApplyAiRenameArgs {
	ctx: HostServiceContext;
	workspaceId: string;
	repoPath: string;
	worktreePath: string;
	oldBranchName: string;
	oldWorkspaceName: string;
	prompt: string;
	/** Replace the workspace title with an AI-picked one. Skip when the user typed a name. */
	renameTitle: boolean;
	/** Replace the git branch name with an AI-picked one. Skip when the user typed a branch. */
	renameBranch: boolean;
}

/**
 * Generates an AI title+branch for a freshly-created workspace and
 * applies whichever side the caller asked for. Git rename runs first
 * (cheap to roll back); the host-local row is the source of truth and
 * commits next; the cloud mirror is pushed best-effort afterwards (a
 * failure leaves the row cloud-dirty for the reconciler).
 *
 * `renameTitle` / `renameBranch` let callers preserve user-typed
 * values: skip replacing whichever side the user supplied directly.
 */
export async function applyAiWorkspaceRename(
	args: ApplyAiRenameArgs,
): Promise<void> {
	const {
		ctx,
		workspaceId,
		repoPath,
		worktreePath,
		oldBranchName,
		oldWorkspaceName,
		prompt,
		renameTitle,
		renameBranch,
	} = args;

	if (!renameTitle && !renameBranch) return;

	const aiNames = await generateWorkspaceNamesFromPrompt(prompt);
	if (!aiNames) return;

	const titleChanged =
		renameTitle && aiNames.title !== "" && aiNames.title !== oldWorkspaceName;
	const branchChanged =
		renameBranch &&
		aiNames.branchName !== "" &&
		aiNames.branchName !== oldBranchName;
	if (!titleChanged && !branchChanged) return;

	let deduped = oldBranchName;
	let gitRenamed = false;
	if (branchChanged) {
		const freshBranches = await listBranchNames(ctx, repoPath);
		deduped = deduplicateBranchName(
			aiNames.branchName,
			freshBranches.filter((b) => b !== oldBranchName),
		);
		try {
			const worktreeGit = await ctx.git(worktreePath);
			await worktreeGit.raw(["branch", "-m", oldBranchName, deduped]);
			gitRenamed = true;
		} catch (err) {
			console.warn("[applyAiWorkspaceRename] git branch rename failed", err);
		}
	}

	const patch: { name?: string; branch?: string } = {};
	if (titleChanged) patch.name = aiNames.title;
	if (gitRenamed) patch.branch = deduped;
	if (patch.name === undefined && patch.branch === undefined) return;

	const updated = updateLocalWorkspace(
		{ db: ctx.db, eventBus: ctx.eventBus },
		workspaceId,
		patch,
	);
	if (!updated) {
		// The git branch may already be renamed at this point; make the
		// row-vs-git divergence observable instead of failing silently.
		console.warn(
			"[applyAiWorkspaceRename] workspace row missing after git rename",
			{ workspaceId, patch },
		);
		return;
	}

	try {
		await ctx.api.v2Workspace.updateNameFromHost.mutate({
			id: workspaceId,
			...patch,
			...(titleChanged ? { expectedCurrentName: oldWorkspaceName } : {}),
		});
		markWorkspaceCloudSynced(ctx.db, workspaceId, {
			expectedUpdatedAt: updated.updatedAt,
		});
	} catch (err) {
		console.warn(
			"[applyAiWorkspaceRename] cloud mirror push failed; reconciler will retry",
			{ workspaceId, err },
		);
	}
}
