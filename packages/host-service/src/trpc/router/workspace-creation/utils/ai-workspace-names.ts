import { Agent } from "@mastra/core/agent";
import { getSmallModel } from "@superset/chat/server/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import {
	buildWorkspaceNamingInput,
	type NamingInputArgs,
} from "./build-naming-input";
import { listBranchNames } from "./list-branch-names";
import { deduplicateBranchName } from "./sanitize-branch";

const WORKSPACE_TITLE_MAX = 150;
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
	return raw
		.trim()
		.replace(/[\s.,;:!?-]+$/g, "")
		.slice(0, WORKSPACE_TITLE_MAX);
}

// Forgiving transforms: coerce anything the model sends into shape
// rather than failing the whole rename. The small model has been
// reliable with `.describe()` guidance so hard bounds aren't needed.
// Empty fields fall through to the caller, which skips the respective
// rename step.
const workspaceNamesSchema = z.object({
	title: z
		.string()
		.transform(trimTitle)
		.describe(
			`Short human-readable workspace title. Up to ${WORKSPACE_TITLE_MAX} characters. No trailing punctuation. Prefer whole words; never truncate mid-word.`,
		),
	branchName: z
		.string()
		.transform(sanitizeBranchCandidate)
		.describe(
			`Git branch name in kebab-case (lowercase, dashes). 2-4 words, up to ${BRANCH_NAME_MAX} characters. Only [a-z0-9-]. No leading/trailing dashes. No prefixes.`,
		),
});

export type GeneratedWorkspaceNames = z.infer<typeof workspaceNamesSchema>;

const INSTRUCTIONS = [
	"You name new code workspaces from context the user provides about the task.",
	"The input may include linked issues, a linked pull request, and/or a free-form prompt.",
	"Prefer linked issue and pull request titles as the source of truth — they typically describe the task most accurately.",
	"Use the prompt as supporting context, but do not let conversational filler override a clear ticket/PR title.",
	"Return a structured object with two fields:",
	`- title: a short human-readable label (<= ${WORKSPACE_TITLE_MAX} chars). Full words only; never cut mid-word. No trailing punctuation.`,
	`- branchName: a kebab-case git branch name (<= ${BRANCH_NAME_MAX} chars, 2-4 words). Only a-z 0-9 and dashes. No prefixes.`,
	"Both fields must describe the same underlying task; the branch is just a compact slug of the title.",
].join("\n");

/**
 * Generates both a workspace title and a git branch name from the user's
 * task context (prompt + any linked issues/PR titles) using a single
 * structured-output LLM call. Shares the same credentials path as
 * `generateTitleFromMessage` (small model via `getSmallModel`).
 *
 * Returns null when the combined context is empty.
 */
export async function generateWorkspaceNames(
	args: NamingInputArgs,
): Promise<GeneratedWorkspaceNames | null> {
	const input = buildWorkspaceNamingInput(args);
	if (!input) return null;

	const model = await getSmallModel();
	if (!model) return null;

	const agent = new Agent({
		id: "workspace-namer",
		name: "Workspace Namer",
		instructions: INSTRUCTIONS,
		model,
	});

	try {
		const { object } = await agent.generate(input, {
			structuredOutput: {
				schema: workspaceNamesSchema,
				jsonPromptInjection: true,
			},
		});
		return object;
	} catch (error) {
		console.warn("[generateWorkspaceNames] generation failed:", error);
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
	/** Free-form composer prompt. Optional — may be empty when the user only attached tickets/PRs. */
	prompt?: string;
	/** Titles of linked GitHub/internal issues. */
	linkedIssueTitles?: string[];
	/** Title of the linked PR, if any. */
	linkedPrTitle?: string;
}

/**
 * Generates an AI title+branch for a freshly-created workspace and
 * applies both. Git rename runs first (cheap to roll back); cloud
 * update is source of truth; host-local DB only writes after cloud
 * confirms. On cloud failure the git rename is reverted so git,
 * host-local DB, and cloud stay in lockstep.
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
		linkedIssueTitles,
		linkedPrTitle,
	} = args;

	const aiNames = await generateWorkspaceNames({
		prompt,
		linkedIssueTitles,
		linkedPrTitle,
	});
	if (!aiNames) return;

	const titleChanged =
		aiNames.title !== "" && aiNames.title !== oldWorkspaceName;
	const branchChanged =
		aiNames.branchName !== "" && aiNames.branchName !== oldBranchName;
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

	const patch: {
		id: string;
		name?: string;
		branch?: string;
		expectedCurrentName?: string;
	} = { id: workspaceId };
	if (titleChanged) {
		patch.name = aiNames.title;
		patch.expectedCurrentName = oldWorkspaceName;
	}
	if (gitRenamed) patch.branch = deduped;
	if (patch.name === undefined && patch.branch === undefined) return;

	try {
		await ctx.api.v2Workspace.updateNameFromHost.mutate(patch);
	} catch (err) {
		if (gitRenamed) {
			await ctx
				.git(worktreePath)
				.then((g) => g.raw(["branch", "-m", deduped, oldBranchName]))
				.catch((rollbackErr) => {
					console.warn(
						`[applyAiWorkspaceRename] git branch rollback failed (workspace ${workspaceId}, ${deduped} → ${oldBranchName})`,
						rollbackErr,
					);
				});
		}
		throw err;
	}

	if (gitRenamed) {
		ctx.db
			.update(workspaces)
			.set({ branch: deduped })
			.where(eq(workspaces.id, workspaceId))
			.run();
	}
}
