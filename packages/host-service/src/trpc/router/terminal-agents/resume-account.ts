import { createHash, randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { HostDb } from "../../../db";
import {
	savedConversations,
	terminalAgentBindings,
	workspaces,
} from "../../../db/schema";
import type { EventBus } from "../../../events";
import { resolveHostAgentConfig } from "../../../terminal-agents/agent-config";
import { validateAccountAuthRouting } from "../agents/account-auth-routing";
import type { AgentRunInput, AgentRunResult } from "../agents/agents";
import {
	accountLaunchUnsupportedReason,
	type LaunchAccountChoice,
	resolveLaunchAccount,
} from "../agents/launch-account";
import { parsePersistedSessionAccount } from "../usage/session-account/session-account";
import {
	inspectAccountResumeHistory,
	sameAccountResumeHistory,
} from "./account-resume-history";
import {
	assertAccountResumeTerminalIdle,
	assertNoRecordedClaudeWriter,
} from "./account-resume-processes";

interface ResumeAccountSourceInput {
	workspaceId: string;
	terminalId: string;
}
export interface ResumeWithAccountInput extends ResumeAccountSourceInput {
	expectedRevision: string;
	account: LaunchAccountChoice;
}

const ENDED_REASONS = ["detached", "terminal-exited", "disposed"];
const PREPARING_REASONS = ENDED_REASONS.map(
	(reason) => `account-resume-preparing:${reason}`,
);
function originalEndReason(reason: string | null): string | undefined {
	if (reason && ENDED_REASONS.includes(reason)) return reason;
	if (reason && PREPARING_REASONS.includes(reason))
		return reason.slice("account-resume-preparing:".length);
	return undefined;
}

function changed(): never {
	throw new TRPCError({
		code: "PRECONDITION_FAILED",
		message:
			"The saved conversation changed or was already resumed. Reopen the account choice. Nothing was launched.",
	});
}

function revisionOf(
	binding: unknown,
	workspace: unknown,
	config: unknown,
): string {
	return createHash("sha256")
		.update(JSON.stringify([binding, workspace, config]))
		.digest("hex");
}

function context(db: HostDb, input: ResumeAccountSourceInput) {
	const binding = db
		.select()
		.from(terminalAgentBindings)
		.where(
			and(
				eq(terminalAgentBindings.terminalId, input.terminalId),
				eq(terminalAgentBindings.workspaceId, input.workspaceId),
			),
		)
		.get();
	if (
		!binding ||
		(binding.agentId !== "claude" && binding.agentId !== "codex") ||
		!binding.agentSessionId
	)
		return null;
	const workspace = db
		.select({ path: workspaces.worktreePath })
		.from(workspaces)
		.where(
			and(eq(workspaces.id, input.workspaceId), isNull(workspaces.archivedAt)),
		)
		.get();
	const config = resolveHostAgentConfig(
		db,
		binding.definitionId ?? binding.agentId,
	);
	const account = parsePersistedSessionAccount(binding.accountJson);
	const revision = revisionOf(binding, workspace, config);
	let reason: string | undefined;
	if (!workspace || !config || config.presetId !== binding.agentId)
		reason = "The original workspace or agent configuration is unavailable.";
	else if (
		!account?.directory ||
		!isAbsolute(account.directory) ||
		account.agent !== binding.agentId ||
		account.conflict ||
		account.credentialKind !== "subscription"
	)
		reason =
			"The original account context is unavailable or conflicting. This conversation cannot be switched safely.";
	else if (binding.endedAt === null)
		reason =
			"Exit this agent normally before choosing another account. Running tools and background jobs do not move.";
	else if (!originalEndReason(binding.endReason))
		reason = "This conversation was already resumed or is being resumed.";
	else if (process.platform !== "darwin" && process.platform !== "linux")
		reason = "Account recovery is not available on this platform.";
	else reason = accountLaunchUnsupportedReason(config);
	return { binding, workspace, config, account, revision, reason };
}

export function accountResumeSource(
	db: HostDb,
	input: ResumeAccountSourceInput,
) {
	const source = context(db, input);
	if (!source) return null;
	return {
		provider: source.binding.agentId as "claude" | "codex",
		agent: source.config?.id ?? source.binding.agentId,
		sessionId: source.binding.agentSessionId as string,
		revision: source.revision,
		ready: source.reason === undefined,
		...(source.reason ? { reason: source.reason } : {}),
		account: source.account ?? null,
	};
}

function assertNoCompetingBinding(
	db: HostDb,
	source: typeof terminalAgentBindings.$inferSelect,
): void {
	const competing = db
		.select({ terminalId: terminalAgentBindings.terminalId })
		.from(terminalAgentBindings)
		.where(
			and(
				eq(terminalAgentBindings.agentId, source.agentId),
				eq(
					terminalAgentBindings.agentSessionId,
					source.agentSessionId as string,
				),
				ne(terminalAgentBindings.terminalId, source.terminalId),
				or(
					inArray(terminalAgentBindings.endReason, PREPARING_REASONS),
					isNull(terminalAgentBindings.endedAt),
					and(
						eq(terminalAgentBindings.endReason, "resumed"),
						isNull(terminalAgentBindings.resumedIntoTerminalId),
					),
				),
			),
		)
		.get();
	const adoptedLaunch = db
		.select({ id: savedConversations.id })
		.from(savedConversations)
		.where(
			and(
				eq(savedConversations.provider, source.agentId),
				eq(savedConversations.nativeSessionId, source.agentSessionId as string),
				eq(savedConversations.state, "opening"),
			),
		)
		.get();
	if (competing || adoptedLaunch)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"This conversation already has a running agent or a pending recovery. Nothing was launched.",
		});
}

export interface ResumeWithAccountDeps {
	db: HostDb;
	runAgent: (input: AgentRunInput) => Promise<AgentRunResult>;
	eventBus: Pick<EventBus, "broadcastTerminalLifecycle">;
	resolveAccount?: typeof resolveLaunchAccount;
	validateRouting?: typeof validateAccountAuthRouting;
	inspectHistory?: typeof inspectAccountResumeHistory;
	assertIdle?: typeof assertAccountResumeTerminalIdle;
	assertNoClaudeWriter?: typeof assertNoRecordedClaudeWriter;
}

const inFlight = new Set<string>();

export async function resumeTerminalWithAccount(
	deps: ResumeWithAccountDeps,
	input: ResumeWithAccountInput,
) {
	const source = context(deps.db, input);
	if (!source || source.revision !== input.expectedRevision) changed();
	if (
		source.reason ||
		!source.account ||
		!source.workspace ||
		!source.config ||
		!source.binding.agentSessionId
	)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				source.reason ??
				"The saved conversation is unavailable. Nothing was launched.",
		});
	const config = source.config;
	const workspace = source.workspace;
	const key = `${source.binding.agentId}:${source.binding.agentSessionId}`;
	if (inFlight.has(key)) changed();
	inFlight.add(key);
	let claimed = false;
	let launchAuthorized = false;
	const terminalId = randomUUID();
	const originalReason = originalEndReason(source.binding.endReason) as string;
	const preparingReason = `account-resume-preparing:${originalReason}`;
	const claimedBinding = {
		...source.binding,
		endReason: preparingReason,
		resumedIntoTerminalId: terminalId,
	};
	try {
		if (
			source.binding.endReason?.startsWith("account-resume-preparing:") &&
			source.binding.resumedIntoTerminalId
		) {
			const reserved = deps.db
				.select()
				.from(terminalAgentBindings)
				.where(
					eq(
						terminalAgentBindings.terminalId,
						source.binding.resumedIntoTerminalId,
					),
				)
				.get();
			if (reserved)
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						"The earlier recovery terminal has a saved agent binding. Open that terminal before trying again. Nothing was launched.",
				});
		}
		const target = await (deps.resolveAccount ?? resolveLaunchAccount)(
			config,
			input.account,
		);
		await (deps.validateRouting ?? validateAccountAuthRouting)(
			target,
			workspace.path,
		);
		const checkIdle = () =>
			(deps.assertIdle ?? assertAccountResumeTerminalIdle)(
				deps.db,
				input.terminalId,
				input.workspaceId,
			);
		const checkWriters = async () => {
			if (source.binding.agentId === "claude")
				await (deps.assertNoClaudeWriter ?? assertNoRecordedClaudeWriter)({
					sessionId: source.binding.agentSessionId as string,
					directories: [
						source.account?.directory as string,
						target.directory as string,
					],
				});
		};
		await checkIdle();
		await checkWriters();
		const historyInput = {
			source: source.account,
			target,
			sessionId: source.binding.agentSessionId,
			cwd: workspace.path,
		};
		const history = await (deps.inspectHistory ?? inspectAccountResumeHistory)(
			historyInput,
		);
		deps.db.transaction((tx) => {
			if (context(deps.db, input)?.revision !== input.expectedRevision)
				changed();
			assertNoCompetingBinding(deps.db, source.binding);
			tx.update(terminalAgentBindings)
				.set({ endReason: preparingReason, resumedIntoTerminalId: terminalId })
				.where(eq(terminalAgentBindings.terminalId, input.terminalId))
				.run();
		});
		claimed = true;
		const assertClaim = () => {
			const current = context(deps.db, input);
			if (
				!current ||
				JSON.stringify(current.binding) !== JSON.stringify(claimedBinding) ||
				revisionOf(source.binding, current.workspace, current.config) !==
					source.revision
			)
				changed();
			assertNoCompetingBinding(deps.db, source.binding);
		};
		const result = await deps.runAgent({
			workspaceId: input.workspaceId,
			agent: config.id,
			prompt: "",
			surface: "terminal",
			resumeSessionId: source.binding.agentSessionId,
			account: target,
			terminalLaunch: {
				terminalId,
				beforeInitialCommand: async () => {
					const currentTarget = await (
						deps.resolveAccount ?? resolveLaunchAccount
					)(config, input.account);
					if (JSON.stringify(currentTarget) !== JSON.stringify(target))
						changed();
					await (deps.validateRouting ?? validateAccountAuthRouting)(
						target,
						workspace.path,
					);
					await checkIdle();
					await checkWriters();
					if (
						!sameAccountResumeHistory(
							history,
							await (deps.inspectHistory ?? inspectAccountResumeHistory)(
								historyInput,
							),
						)
					)
						changed();
					assertClaim();
				},
				onInitialCommandReady: () => {
					// Called in the same transaction that persists the target binding.
					const current = deps.db
						.select()
						.from(terminalAgentBindings)
						.where(eq(terminalAgentBindings.terminalId, input.terminalId))
						.get();
					if (JSON.stringify(current) !== JSON.stringify(claimedBinding))
						changed();
					deps.db
						.update(terminalAgentBindings)
						.set({ endReason: "resumed" })
						.where(eq(terminalAgentBindings.terminalId, input.terminalId))
						.run();
					// Adoption follows the local continuation, never its original
					// import account or source snapshot. This shares the target
					// binding/source-successor transaction above.
					deps.db
						.update(savedConversations)
						.set({
							terminalId,
							accountJson: JSON.stringify(target),
							state: "bound",
						})
						.where(
							and(
								eq(savedConversations.terminalId, input.terminalId),
								eq(savedConversations.provider, source.binding.agentId),
								eq(
									savedConversations.nativeSessionId,
									source.binding.agentSessionId as string,
								),
							),
						)
						.run();
					launchAuthorized = true;
				},
			},
		});
		if (!launchAuthorized || result.sessionId !== terminalId) changed();
		deps.eventBus.broadcastTerminalLifecycle({
			workspaceId: input.workspaceId,
			terminalId: input.terminalId,
			eventType: "resumed",
			resumedTerminalId: result.sessionId,
			label: result.label,
			occurredAt: Date.now(),
		});
		return {
			resumed: true as const,
			terminalId: result.sessionId,
			label: result.label,
		};
	} catch (error) {
		if (claimed && !launchAuthorized) {
			deps.db.transaction((tx) => {
				const current = tx
					.select()
					.from(terminalAgentBindings)
					.where(eq(terminalAgentBindings.terminalId, input.terminalId))
					.get();
				if (JSON.stringify(current) !== JSON.stringify(claimedBinding)) return;
				tx.update(terminalAgentBindings)
					.set({ endReason: originalReason, resumedIntoTerminalId: null })
					.where(eq(terminalAgentBindings.terminalId, input.terminalId))
					.run();
			});
		}
		throw error;
	} finally {
		inFlight.delete(key);
	}
}
