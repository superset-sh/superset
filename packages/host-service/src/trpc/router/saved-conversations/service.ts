import { randomUUID } from "node:crypto";
import { realpath, unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { HostDb } from "../../../db";
import {
	savedConversations,
	terminalAgentBindings,
	terminalSessions,
	workspaces,
} from "../../../db/schema";
import { getDaemonClient } from "../../../terminal/daemon-client-singleton";
import { resolveHostAgentConfig } from "../../../terminal-agents/agent-config";
import { validateAccountAuthRouting } from "../agents/account-auth-routing";
import type { AgentRunInput, AgentRunResult } from "../agents/agents";
import {
	type LaunchAccountChoice,
	resolveLaunchAccount,
} from "../agents/launch-account";
import {
	inspectAccountResumeHistory,
	sameAccountResumeHistory,
} from "../terminal-agents/account-resume-history";
import {
	assertAccountResumeTerminalIdle,
	assertNoRecordedClaudeWriter,
} from "../terminal-agents/account-resume-processes";
import {
	parsePersistedSessionAccount,
	sameSessionAccountContext,
} from "../usage/session-account/session-account";
import {
	checkpointNativeHistory,
	discoverNativeMetadata,
	nativeMetadata,
	revision,
	unavailable,
} from "./history";

export interface SavedConversationContext {
	workspaceId: string;
	agent: string;
	account: LaunchAccountChoice;
}
export interface SavedConversationDeps {
	db: HostDb;
	runAgent?: (input: AgentRunInput) => Promise<AgentRunResult>;
	checkpointDirectory: string;
	resolveAccount?: typeof resolveLaunchAccount;
	validateRouting?: typeof validateAccountAuthRouting;
	inspectHistory?: typeof inspectAccountResumeHistory;
	assertNoWriter?: typeof assertNoRecordedClaudeWriter;
	assertPreviousIdle?: (
		terminalId: string,
		workspaceId: string,
	) => Promise<void>;
}

type SavedConversation = typeof savedConversations.$inferSelect;
const inFlight = new Set<string>();

async function context(
	deps: SavedConversationDeps,
	input: SavedConversationContext,
) {
	const workspace = deps.db
		.select({ path: workspaces.worktreePath })
		.from(workspaces)
		.where(
			and(eq(workspaces.id, input.workspaceId), isNull(workspaces.archivedAt)),
		)
		.get();
	const config = resolveHostAgentConfig(deps.db, input.agent);
	if (!workspace || !config || config.presetId !== "claude")
		unavailable("Choose an existing workspace and a supported Claude agent.");
	const account = await (deps.resolveAccount ?? resolveLaunchAccount)(
		config,
		input.account,
	);
	if (
		account.agent !== "claude" ||
		!account.directory ||
		account.conflict ||
		!account.pinned
	)
		unavailable();
	const cwd = await realpath(workspace.path);
	const projectsPath = join(account.directory, "projects");
	let storePath: string;
	try {
		storePath = await realpath(projectsPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") unavailable();
		storePath = projectsPath;
	}
	return {
		workspace,
		config,
		account,
		cwd,
		storePath,
		revision: revision([workspace, config, account, cwd, storePath]),
	};
}

function readSaved(
	db: HostDb,
	workspaceId: string,
	id: string,
): SavedConversation {
	const saved = db
		.select()
		.from(savedConversations)
		.where(
			and(
				eq(savedConversations.id, id),
				eq(savedConversations.workspaceId, workspaceId),
			),
		)
		.get();
	if (
		!saved ||
		saved.provider !== "claude" ||
		!["adopted", "opening", "bound"].includes(saved.state)
	)
		unavailable(
			"This saved conversation is no longer available in this workspace.",
		);
	return saved;
}

function present(saved: SavedConversation, db?: HostDb) {
	const binding =
		saved.terminalId && db
			? db
					.select()
					.from(terminalAgentBindings)
					.where(eq(terminalAgentBindings.terminalId, saved.terminalId))
					.get()
			: null;
	return {
		id: saved.id,
		nativeSessionId: saved.nativeSessionId,
		revision: revision(saved),
		state: saved.state as "adopted" | "opening" | "bound",
		terminalId: saved.terminalId,
		canFocusExisting: Boolean(
			saved.state === "bound" &&
				binding &&
				binding.endedAt === null &&
				binding.agentId === saved.provider &&
				binding.agentSessionId === saved.nativeSessionId &&
				binding.workspaceId === saved.workspaceId &&
				sameSessionAccountContext(
					parsePersistedSessionAccount(binding.accountJson),
					parsePersistedSessionAccount(saved.accountJson),
				) &&
				(!binding.transcriptPath ||
					binding.transcriptPath === saved.transcriptPath),
		),
	};
}

function assertNoCompetingLaunch(
	db: HostDb,
	nativeSessionId: string,
	conversationId: string,
	targetTerminalId?: string,
) {
	const binding = db
		.select({ id: terminalAgentBindings.terminalId })
		.from(terminalAgentBindings)
		.where(
			and(
				eq(terminalAgentBindings.agentId, "claude"),
				eq(terminalAgentBindings.agentSessionId, nativeSessionId),
				targetTerminalId
					? ne(terminalAgentBindings.terminalId, targetTerminalId)
					: undefined,
				or(
					isNull(terminalAgentBindings.endedAt),
					sql`${terminalAgentBindings.endReason} LIKE 'account-resume-preparing:%'`,
					and(
						eq(terminalAgentBindings.endReason, "resumed"),
						isNull(terminalAgentBindings.resumedIntoTerminalId),
					),
				),
			),
		)
		.get();
	const opening = db
		.select({ id: savedConversations.id })
		.from(savedConversations)
		.where(
			and(
				eq(savedConversations.provider, "claude"),
				eq(savedConversations.nativeSessionId, nativeSessionId),
				eq(savedConversations.state, "opening"),
				ne(savedConversations.id, conversationId),
			),
		)
		.get();
	if (binding || opening)
		unavailable(
			"This conversation already has a running agent or a pending launch. Open its existing terminal.",
		);
}

async function assertPreviousIdle(
	deps: SavedConversationDeps,
	terminalId: string,
	workspaceId: string,
) {
	if (deps.assertPreviousIdle)
		return deps.assertPreviousIdle(terminalId, workspaceId);
	const terminal = deps.db
		.select()
		.from(terminalSessions)
		.where(eq(terminalSessions.id, terminalId))
		.get();
	if (terminal)
		return assertAccountResumeTerminalIdle(deps.db, terminalId, workspaceId);
	// Terminal-row cleanup is not proof that a detached process has exited.
	if (
		(await (await getDaemonClient()).list()).some(
			(session) => session.id === terminalId && session.alive,
		)
	)
		unavailable(
			"The previous terminal is still running. Open it before continuing this conversation.",
		);
}

export async function listSavedConversations(
	deps: SavedConversationDeps,
	input: SavedConversationContext & { cursor?: string },
) {
	const current = await context(deps, input);
	const page = await discoverNativeMetadata(
		current.storePath,
		current.cwd,
		input.cursor,
	);
	const saved = deps.db
		.select()
		.from(savedConversations)
		.where(
			and(
				eq(savedConversations.workspaceId, input.workspaceId),
				eq(savedConversations.provider, "claude"),
				eq(savedConversations.storePath, current.storePath),
			),
		)
		.all()
		.filter((row) => {
			const account = parsePersistedSessionAccount(row.accountJson);
			return (
				account?.identity === current.account.identity &&
				account.selection === current.account.selection
			);
		});
	return {
		provider: "claude" as const,
		cwd: current.cwd,
		candidates: page.candidates.map(({ nativeSessionId, ...metadata }) => ({
			nativeSessionId,
			lastModifiedAt: metadata.modifiedAt,
			bytes: metadata.size,
			revision: revision([current.revision, nativeSessionId, metadata]),
			conversationId:
				saved.find((row) => row.nativeSessionId === nativeSessionId)?.id ??
				null,
		})),
		conversations: saved.map((row) => present(row, deps.db)),
		nextCursor: page.nextCursor,
	};
}

export async function adoptNativeConversation(
	deps: SavedConversationDeps,
	input: SavedConversationContext & {
		nativeSessionId: string;
		expectedRevision: string;
	},
) {
	const current = await context(deps, input);
	const metadata = await nativeMetadata(
		current.storePath,
		current.cwd,
		input.nativeSessionId,
	);
	if (
		revision([current.revision, input.nativeSessionId, metadata]) !==
		input.expectedRevision
	)
		unavailable();
	const key = `claude:${current.storePath}:${input.nativeSessionId}`;
	if (inFlight.has(key))
		unavailable(
			"This conversation is already being opened. Wait for that operation to finish.",
		);
	inFlight.add(key);
	let checkpoint: string | undefined;
	let persisted = false;
	try {
		const existing = deps.db
			.select()
			.from(savedConversations)
			.where(
				and(
					eq(savedConversations.provider, "claude"),
					eq(savedConversations.nativeSessionId, input.nativeSessionId),
					eq(savedConversations.storePath, current.storePath),
				),
			)
			.get();
		if (existing) {
			if (
				existing.workspaceId !== input.workspaceId ||
				existing.cwd !== current.cwd ||
				existing.transcriptPath !== metadata.path ||
				!sameSessionAccountContext(
					parsePersistedSessionAccount(existing.accountJson),
					current.account,
				)
			)
				unavailable(
					"This conversation is already adopted with a different workspace or account. Open its existing saved record.",
				);
			return present(existing, deps.db);
		}
		assertNoCompetingLaunch(deps.db, input.nativeSessionId, "");
		await (deps.assertNoWriter ?? assertNoRecordedClaudeWriter)({
			sessionId: input.nativeSessionId,
			directories: [current.account.directory as string],
		});
		const history = await (deps.inspectHistory ?? inspectAccountResumeHistory)({
			source: current.account,
			target: current.account,
			sessionId: input.nativeSessionId,
			cwd: current.cwd,
		});
		// Compare the scan's file identity with the complete validated read.
		const { sha256: _hash, ...readMetadata } = history;
		if (revision(metadata) !== revision(readMetadata)) unavailable();
		const id = randomUUID();
		checkpoint = await checkpointNativeHistory(
			history,
			deps.checkpointDirectory,
			id,
		);
		if (
			(await context(deps, input)).revision !== current.revision ||
			!sameAccountResumeHistory(
				history,
				await (deps.inspectHistory ?? inspectAccountResumeHistory)({
					source: current.account,
					target: current.account,
					sessionId: input.nativeSessionId,
					cwd: current.cwd,
				}),
			)
		)
			unavailable();
		const row = {
			id,
			workspaceId: input.workspaceId,
			provider: "claude",
			nativeSessionId: input.nativeSessionId,
			storePath: current.storePath,
			transcriptPath: history.path,
			cwd: current.cwd,
			definitionId: current.config.id,
			accountJson: JSON.stringify(current.account),
			adoptedAt: Date.now(),
			state: "adopted",
			terminalId: null,
			provenanceJson: JSON.stringify({
				version: 1,
				source: "native-claude",
				nativeSessionId: input.nativeSessionId,
				cwd: current.cwd,
				transcriptPath: history.path,
				sha256: history.sha256,
				checkpointPath: checkpoint,
			}),
		};
		deps.db.transaction(() => {
			assertNoCompetingLaunch(deps.db, input.nativeSessionId, id);
			deps.db.insert(savedConversations).values(row).run();
		});
		persisted = true;
		return present(readSaved(deps.db, input.workspaceId, id), deps.db);
	} finally {
		if (checkpoint && !persisted) await unlink(checkpoint);
		inFlight.delete(key);
	}
}

export async function openSavedConversation(
	deps: SavedConversationDeps,
	input: {
		workspaceId: string;
		conversationId: string;
		expectedRevision: string;
		originalSessionExited: boolean;
	},
) {
	const original = readSaved(deps.db, input.workspaceId, input.conversationId);
	if (revision(original) !== input.expectedRevision) unavailable();
	if (original.state === "bound" && original.terminalId) {
		const active = deps.db
			.select()
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, original.terminalId))
			.get();
		const workspace = deps.db
			.select({ path: workspaces.worktreePath })
			.from(workspaces)
			.where(
				and(
					eq(workspaces.id, original.workspaceId),
					isNull(workspaces.archivedAt),
				),
			)
			.get();
		if (
			active &&
			active.endedAt === null &&
			active.agentId === original.provider &&
			active.agentSessionId === original.nativeSessionId &&
			active.workspaceId === original.workspaceId &&
			sameSessionAccountContext(
				parsePersistedSessionAccount(active.accountJson),
				parsePersistedSessionAccount(original.accountJson),
			) &&
			(!active.transcriptPath ||
				active.transcriptPath === original.transcriptPath) &&
			workspace &&
			(await realpath(workspace.path)) === original.cwd
		) {
			// Navigation is not a provider launch. A later logout must not hide
			// an already-open conversation whose exact binding is preserved.
			return {
				conversationId: original.id,
				terminalId: original.terminalId,
				state: "bound" as const,
				label:
					resolveHostAgentConfig(deps.db, original.definitionId)?.label ??
					"Claude",
			};
		}
	}
	const account = parsePersistedSessionAccount(original.accountJson);
	if (
		!account ||
		account.agent !== "claude" ||
		!account.directory ||
		account.conflict ||
		!account.pinned
	)
		unavailable();
	const contextInput = {
		workspaceId: input.workspaceId,
		agent: original.definitionId,
		account,
	};
	const current = await context(deps, contextInput);
	if (
		current.cwd !== original.cwd ||
		current.storePath !== original.storePath ||
		!sameSessionAccountContext(account, current.account)
	)
		unavailable(
			"The saved conversation's account or working folder changed. Nothing was launched.",
		);
	const key = `claude:${original.storePath}:${original.nativeSessionId}`;
	if (inFlight.has(key))
		unavailable(
			"This conversation is already being opened. Wait for that operation to finish.",
		);
	inFlight.add(key);
	let claimed = false;
	let authorized = false;
	const terminalId = randomUUID();
	const claimedRow = { ...original, state: "opening", terminalId };
	try {
		if (original.terminalId) {
			const binding = deps.db
				.select()
				.from(terminalAgentBindings)
				.where(eq(terminalAgentBindings.terminalId, original.terminalId))
				.get();
			if (binding) {
				if (
					binding.agentId !== "claude" ||
					binding.agentSessionId !== original.nativeSessionId ||
					binding.workspaceId !== original.workspaceId ||
					!sameSessionAccountContext(
						parsePersistedSessionAccount(binding.accountJson),
						account,
					) ||
					(binding.transcriptPath &&
						binding.transcriptPath !== original.transcriptPath)
				)
					unavailable(
						"The previous terminal no longer matches this saved conversation. Nothing was launched.",
					);
				if (original.state === "opening")
					unavailable(
						"The earlier launch has a saved binding. Open its terminal before trying again.",
					);
				if (binding.endedAt === null)
					return {
						conversationId: original.id,
						terminalId: binding.terminalId,
						state: "bound" as const,
						label: current.config.label,
					};
				if (
					binding.resumedIntoTerminalId ||
					binding.endReason?.startsWith("account-resume-preparing:") ||
					binding.endReason === "resumed"
				)
					unavailable(
						"This conversation has a recovery in progress. Open its successor terminal.",
					);
			}
			await assertPreviousIdle(deps, original.terminalId, input.workspaceId);
		}
		if (!input.originalSessionExited)
			unavailable(
				"Exit the original conversation and confirm that no background work is running before opening a new terminal.",
			);
		await (deps.validateRouting ?? validateAccountAuthRouting)(
			current.account,
			current.cwd,
		);
		const checkWriter = () =>
			(deps.assertNoWriter ?? assertNoRecordedClaudeWriter)({
				sessionId: original.nativeSessionId,
				directories: [current.account.directory as string],
			});
		await checkWriter();
		const historyInput = {
			source: current.account,
			target: current.account,
			sessionId: original.nativeSessionId,
			cwd: current.cwd,
		};
		const history = await (deps.inspectHistory ?? inspectAccountResumeHistory)(
			historyInput,
		);
		if (history.path !== original.transcriptPath) unavailable();
		deps.db.transaction(() => {
			if (
				revision(readSaved(deps.db, input.workspaceId, original.id)) !==
				input.expectedRevision
			)
				unavailable();
			assertNoCompetingLaunch(deps.db, original.nativeSessionId, original.id);
			deps.db
				.update(savedConversations)
				.set({ state: "opening", terminalId })
				.where(eq(savedConversations.id, original.id))
				.run();
		});
		claimed = true;
		const assertClaim = () => {
			if (
				revision(readSaved(deps.db, input.workspaceId, original.id)) !==
				revision(claimedRow)
			)
				unavailable();
			assertNoCompetingLaunch(
				deps.db,
				original.nativeSessionId,
				original.id,
				terminalId,
			);
		};
		if (!deps.runAgent) unavailable();
		const result = await deps.runAgent({
			workspaceId: input.workspaceId,
			agent: current.config.id,
			prompt: "",
			surface: "terminal",
			resumeSessionId: original.nativeSessionId,
			account: current.account,
			terminalLaunch: {
				terminalId,
				beforeInitialCommand: async () => {
					if ((await context(deps, contextInput)).revision !== current.revision)
						unavailable();
					await (deps.validateRouting ?? validateAccountAuthRouting)(
						current.account,
						current.cwd,
					);
					if (original.terminalId)
						await assertPreviousIdle(
							deps,
							original.terminalId,
							input.workspaceId,
						);
					await checkWriter();
					if (
						!sameAccountResumeHistory(
							history,
							await (deps.inspectHistory ?? inspectAccountResumeHistory)(
								historyInput,
							),
						)
					)
						unavailable();
					assertClaim();
				},
				onInitialCommandReady: () => {
					// The launcher wraps this and the target binding in one transaction.
					assertClaim();
					const bound = deps.db
						.select()
						.from(terminalAgentBindings)
						.where(eq(terminalAgentBindings.terminalId, terminalId))
						.get();
					if (
						!bound ||
						bound.agentId !== "claude" ||
						bound.agentSessionId !== original.nativeSessionId ||
						bound.workspaceId !== original.workspaceId ||
						!sameSessionAccountContext(
							parsePersistedSessionAccount(bound.accountJson),
							account,
						)
					)
						unavailable(
							"The new terminal binding does not match the saved conversation. Nothing was launched.",
						);
					deps.db
						.update(savedConversations)
						.set({ state: "bound" })
						.where(eq(savedConversations.id, original.id))
						.run();
					authorized = true;
				},
			},
		});
		if (
			!authorized ||
			result.kind !== "terminal" ||
			result.sessionId !== terminalId
		)
			unavailable();
		return {
			conversationId: original.id,
			terminalId,
			state: "bound" as const,
			label: result.label,
		};
	} catch (error) {
		if (
			claimed &&
			revision(readSaved(deps.db, input.workspaceId, original.id)) ===
				revision(claimedRow) &&
			!deps.db
				.select({ id: terminalAgentBindings.terminalId })
				.from(terminalAgentBindings)
				.where(eq(terminalAgentBindings.terminalId, terminalId))
				.get()
		)
			deps.db
				.update(savedConversations)
				.set({ state: original.state, terminalId: original.terminalId })
				.where(eq(savedConversations.id, original.id))
				.run();
		throw error;
	} finally {
		inFlight.delete(key);
	}
}
