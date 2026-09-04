import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { basename } from "node:path";
import { generateFriendlyBranchName } from "@superset/shared/workspace-launch";
import { workspaceTagsInputSchema } from "@superset/shared/workspace-tags";
import { TRPCError } from "@trpc/server";
import { isNull } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import {
	getLocalWorkspace,
	insertLocalWorkspace,
	toCloudShape,
	updateLocalWorkspace,
} from "../../../../workspaces/local-workspace-store";
import { protectedProcedure } from "../../../index";
import { validateAgentLaunchOptions } from "../../agents";
import { initEmptyRepo } from "../../project/utils/resolve-repo";
import { startCommandTerminal } from "../shared/command-terminal";
import {
	agentLaunchSchema,
	dispatchSugarAgents,
} from "../shared/dispatch-agents";
import {
	defaultSessionsRoot,
	safeResolveSessionPath,
} from "../shared/session-paths";
import {
	generateWorkspaceNamesFromPrompt,
	sanitizeBranchCandidate,
} from "../utils/ai-workspace-names";
import { deduplicateBranchName } from "../utils/sanitize-branch";

const createSessionInputSchema = z.object({
	// Optimistic-UI idempotency key; becomes the row id.
	id: z.string().uuid().optional(),
	// Display name; also seeds the folder name. Omitted with an agent
	// prompt → friendly-random folder plus an LLM title applied before
	// agents start (the folder keeps its creation-time name).
	name: z.string().min(1).optional(),
	agents: z.array(agentLaunchSchema).optional(),
	command: z.string().min(1).optional(),
	namingPrompt: z.string().min(1).optional(),
	// Sessions render in a flat lane (no per-project folders), but the tags
	// are stored so listings and future consumers see them — automation
	// dispatch sends its tag set for sessions and worktrees alike.
	tags: workspaceTagsInputSchema.optional(),
});

/** Names already claimed: session dirs on disk plus session rows in the DB.
 * Deliberately includes archived tombstones — reusing a tombstone's folder
 * path would defeat the archived-workspace reconciler's live-path guard. */
function claimedSessionNames(ctx: HostServiceContext): string[] {
	const root = defaultSessionsRoot();
	const onDisk = existsSync(root) ? readdirSync(root) : [];
	const inDb = ctx.db
		.select({ worktreePath: workspaces.worktreePath })
		.from(workspaces)
		.where(isNull(workspaces.projectId))
		.all()
		.map((row) => basename(row.worktreePath));
	return [...onDisk, ...inDb];
}

/**
 * Create a project-less "session" workspace: a standalone git repo in a
 * managed folder under `~/.superset/sessions`. No project row, no worktree,
 * no branch semantics beyond the repo's own `main` — but a real workspace
 * row, so terminals, chat, agents, and git status all work unchanged.
 */
export const createSession = protectedProcedure
	.input(createSessionInputSchema)
	.mutation(async ({ ctx, input }) => {
		for (const launch of input.agents ?? []) {
			validateAgentLaunchOptions(ctx.db, launch);
		}

		// Idempotency: a retry carrying the same optimistic id must return the
		// existing row instead of allocating a second folder and then dying on
		// the primary key (which would leak the freshly-created directory).
		if (input.id !== undefined) {
			const existing = getLocalWorkspace(ctx.db, input.id);
			if (existing) {
				return {
					workspace: toCloudShape(existing, ctx.organizationId),
					terminals: [],
					agents: [],
				};
			}
		}

		// AI title, same contract as `workspaces.create`: only when the
		// caller supplied a prompt but no name. Sessions never rename their
		// folder — the generated title only relabels the row.
		const composerPrompt =
			input.agents?.[0]?.prompt?.trim() || input.namingPrompt?.trim() || "";
		const wantAi = input.name === undefined && !!composerPrompt;
		const namingAgent = input.agents?.[0]?.agent;
		const aiNamesPromise = wantAi
			? generateWorkspaceNamesFromPrompt(
					composerPrompt,
					namingAgent ? { db: ctx.db, agent: namingAgent } : undefined,
				).catch((err) => {
					console.warn("[workspaces.createSession] AI naming failed", err);
					return null;
				})
			: null;

		const typedName = input.name?.trim();
		const folderCandidate =
			(typedName ? sanitizeBranchCandidate(typedName) : "") ||
			generateFriendlyBranchName();

		mkdirSync(defaultSessionsRoot(), { recursive: true });

		// Dedupe against dirs + rows, then let initEmptyRepo's atomic mkdir
		// close the race: on EEXIST, re-dedupe and retry.
		let repoPath: string | undefined;
		let folderName = folderCandidate;
		for (let attempt = 0; attempt < 3 && repoPath === undefined; attempt++) {
			folderName = deduplicateBranchName(
				folderCandidate,
				claimedSessionNames(ctx),
			);
			const sessionPath = safeResolveSessionPath(folderName);
			try {
				const resolved = await initEmptyRepo(defaultSessionsRoot(), folderName);
				repoPath = resolved.repoPath;
			} catch (err) {
				// Lost the mkdir race (initEmptyRepo's atomic claim failed on
				// EEXIST) — re-dedupe and retry; anything else propagates.
				const lostRace = existsSync(sessionPath);
				if (!lostRace || attempt === 2) throw err;
			}
		}
		if (repoPath === undefined) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Could not allocate a session folder",
			});
		}

		let row: ReturnType<typeof insertLocalWorkspace>;
		try {
			row = insertLocalWorkspace(ctx, {
				id: input.id,
				projectId: null,
				worktreePath: repoPath,
				branch: "main",
				name: typedName || folderName,
				type: "session",
				createdByUserId: ctx.userId ?? null,
				tags: input.tags,
			});
		} catch (err) {
			// The folder was allocated this call and holds only the scaffold —
			// remove it so a failed insert (e.g. a concurrent create winning
			// the same optimistic id) can't leak directories. Best-effort: a
			// cleanup failure must not mask the insert error or the
			// winner-return path below.
			try {
				await rm(repoPath, { recursive: true, force: true });
			} catch (cleanupErr) {
				console.warn(
					"[workspaces.createSession] failed to clean up session folder after insert failure:",
					cleanupErr,
				);
			}
			if (input.id !== undefined) {
				const winner = getLocalWorkspace(ctx.db, input.id);
				if (winner) {
					return {
						workspace: toCloudShape(winner, ctx.organizationId),
						terminals: [],
						agents: [],
					};
				}
			}
			throw err;
		}

		const aiNames = aiNamesPromise ? await aiNamesPromise : null;
		if (aiNames?.title) {
			row = updateLocalWorkspace(ctx, row.id, { name: aiNames.title }) ?? row;
		}

		const terminalsResult: Array<{ terminalId: string; label: string }> = [];
		const [agentsResult, commandResult] = await Promise.all([
			dispatchSugarAgents(ctx, row.id, input.agents ?? []),
			input.command
				? startCommandTerminal({
						ctx,
						workspaceId: row.id,
						command: input.command,
					})
				: Promise.resolve(null),
		]);
		if (commandResult?.warning) {
			console.warn(
				`[workspaces.createSession] command warning: ${commandResult.warning}`,
			);
		}
		if (commandResult?.terminal) {
			terminalsResult.push({
				terminalId: commandResult.terminal.id,
				label: commandResult.terminal.label,
			});
		}

		return {
			workspace: toCloudShape(row, ctx.organizationId),
			terminals: terminalsResult,
			agents: agentsResult,
		};
	});
