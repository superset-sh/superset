import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { Agent } from "@mastra/core/agent";
import { getSmallModel } from "@superset/chat/server/shared";
import {
	getBuiltinAgentDefinition,
	isBuiltinAgentId,
	isTerminalAgentDefinition,
} from "@superset/shared/agent-catalog";
import { quoteSingleShell } from "@superset/shared/agent-prompt-launch";
import { asc } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../../db";
import { hostAgentConfigs } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import {
	markWorkspaceCloudSynced,
	updateLocalWorkspace,
} from "../../../../workspaces/local-workspace-store";
import { resolveHostAgentConfig } from "../../agents/agents";
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

// Agent CLIs cold-start (~2-4s) before the model call, so they get a much
// longer budget than the direct small-model path. The total budget spans
// all candidate attempts; workspace creation blocks on naming, so it is
// also the worst-case added create latency. Attempts shorter than the
// floor aren't worth a CLI cold-start — skip straight to the fallback.
const AGENT_GENERATE_TIMEOUT_MS = 20_000;
const AGENT_NAMING_TOTAL_BUDGET_MS = 25_000;
const AGENT_NAMING_MIN_ATTEMPT_MS = 2_000;

const AGENT_JSON_INSTRUCTIONS = [
	INSTRUCTIONS,
	"",
	'Respond with ONLY a JSON object on a single line: {"title": "...", "branchName": "..."}. No prose, no code fences, no tool use.',
].join("\n");

/**
 * The agent context used to name via an agent CLI: candidate agents
 * resolve to builtin presets whose `nonInteractiveCommand` runs the
 * naming prompt headlessly with the agent's own credentials. `agent`
 * (the launch's instance id or preset id) is tried first when present;
 * the host's other configured agents follow in display order.
 */
export interface WorkspaceNamingAgentContext {
	db: HostDb;
	agent?: string;
}

function listConfiguredPresetIds(db: HostDb): string[] {
	return db
		.select({ presetId: hostAgentConfigs.presetId })
		.from(hostAgentConfigs)
		.orderBy(asc(hostAgentConfigs.displayOrder))
		.all()
		.map((row) => row.presetId);
}

/**
 * Orders naming candidates: the preferred preset first, then the
 * remaining configured presets, deduplicated, keeping only builtin
 * terminal agents that have a headless mode.
 */
export function orderNamingCandidates(
	configuredPresetIds: string[],
	preferredPresetId?: string,
): Array<{ presetId: string; command: string }> {
	const seen = new Set<string>();
	const candidates: Array<{ presetId: string; command: string }> = [];
	const ordered = preferredPresetId
		? [preferredPresetId, ...configuredPresetIds]
		: configuredPresetIds;
	for (const presetId of ordered) {
		if (seen.has(presetId)) continue;
		seen.add(presetId);
		if (!isBuiltinAgentId(presetId)) continue;
		const definition = getBuiltinAgentDefinition(presetId);
		if (!isTerminalAgentDefinition(definition)) continue;
		if (!definition.nonInteractiveCommand) continue;
		candidates.push({ presetId, command: definition.nonInteractiveCommand });
	}
	return candidates;
}

function extractNamesJson(
	output: string,
): { title: string; branchName: string } | null {
	// Agent CLIs may prepend banners (skill/hook load lines) or wrap the
	// object in fences; take the last flat JSON object with both fields.
	const candidates = output.match(/\{[^{}]*\}/g);
	if (!candidates) return null;
	for (const candidate of candidates.reverse()) {
		try {
			const parsed: unknown = JSON.parse(candidate);
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				"title" in parsed &&
				"branchName" in parsed &&
				typeof parsed.title === "string" &&
				typeof parsed.branchName === "string"
			) {
				return { title: parsed.title, branchName: parsed.branchName };
			}
		} catch {
			// not JSON — keep scanning earlier candidates
		}
	}
	return null;
}

async function generateNamesViaAgentCli(
	command: string,
	prompt: string,
	timeoutMs: number,
): Promise<GeneratedWorkspaceNames | null> {
	const shell =
		process.env.SHELL ||
		(process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
	const namingPrompt = `${AGENT_JSON_INSTRUCTIONS}\n\nUser prompt:\n${prompt}`;
	// Login shell so the agent binary resolves like it does in the user's
	// terminal (nvm/bun-global paths a GUI-launched host-service lacks).
	// cwd is a scratch dir: naming runs before the worktree exists and the
	// agent must not pick up repo context or act on files.
	const shellCommand = `${command} ${quoteSingleShell(namingPrompt)}`;

	const output = await new Promise<string | null>((resolve) => {
		const child = spawn(shell, ["-lc", shellCommand], {
			cwd: tmpdir(),
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const settle = (value: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			console.warn(`[generateNamesViaAgentCli] timed out after ${timeoutMs}ms`);
			settle(null);
		}, timeoutMs);
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			console.warn("[generateNamesViaAgentCli] spawn failed:", error);
			settle(null);
		});
		child.on("close", (code) => {
			if (code !== 0) {
				console.warn(
					`[generateNamesViaAgentCli] exit ${code}; stderr tail: ${stderr.slice(-500)}; stdout tail: ${stdout.slice(-200)}`,
				);
			}
			settle(code === 0 ? stdout : null);
		});
	});
	if (output === null) return null;

	const names = extractNamesJson(output);
	if (!names) {
		console.warn(
			`[generateNamesViaAgentCli] no JSON names in output tail: ${output.slice(-300)}`,
		);
		return null;
	}
	const parsed = workspaceNamesSchema.parse(names);
	if (parsed.title === "" && parsed.branchName === "") return null;
	return parsed;
}

/**
 * Generates both a workspace title and a git branch name from a prompt.
 * With an agent context, configured agent CLIs with a headless mode do
 * the naming with their own credentials — covering users with no
 * Anthropic/OpenAI keys. The launch's agent goes first, then the host's
 * other configured agents, under one total budget. Falls back to a
 * structured-output small-model call (`getSmallModel`), and returns null
 * when that fails too (callers then keep their friendly-random name).
 */
export async function generateWorkspaceNamesFromPrompt(
	prompt: string,
	agentContext?: WorkspaceNamingAgentContext,
): Promise<GeneratedWorkspaceNames | null> {
	const cleaned = prompt.trim();
	if (!cleaned) return null;

	if (agentContext) {
		const preferredPresetId = agentContext.agent
			? (resolveHostAgentConfig(agentContext.db, agentContext.agent)
					?.presetId ?? agentContext.agent)
			: undefined;
		const candidates = orderNamingCandidates(
			listConfiguredPresetIds(agentContext.db),
			preferredPresetId,
		);
		const deadline = Date.now() + AGENT_NAMING_TOTAL_BUDGET_MS;
		for (const candidate of candidates) {
			const remaining = deadline - Date.now();
			if (remaining < AGENT_NAMING_MIN_ATTEMPT_MS) {
				console.warn(
					"[generateWorkspaceNamesFromPrompt] agent naming budget exhausted",
				);
				break;
			}
			try {
				const names = await generateNamesViaAgentCli(
					candidate.command,
					cleaned,
					Math.min(AGENT_GENERATE_TIMEOUT_MS, remaining),
				);
				if (names) {
					console.log(
						`[generateWorkspaceNamesFromPrompt] named via agent CLI (${candidate.presetId})`,
					);
					return names;
				}
			} catch (error) {
				console.warn(
					`[generateWorkspaceNamesFromPrompt] agent CLI (${candidate.presetId}) naming failed:`,
					error,
				);
			}
		}
		if (candidates.length > 0) {
			console.warn(
				"[generateWorkspaceNamesFromPrompt] no agent CLI produced names; falling back to small model",
			);
		}
	}

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

	const aiNames = await generateWorkspaceNamesFromPrompt(prompt, {
		db: ctx.db,
	});
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
