import crypto from "node:crypto";
import { mintUserJwt } from "@superset/auth/server";
import { dbWs } from "@superset/db/client";
import {
	automationRuns,
	chatSessions,
	type SelectAutomation,
	users,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import {
	buildPromptCommandFromAgentConfig,
	getCommandFromAgentConfig,
	type TerminalResolvedAgentConfig,
} from "@superset/shared/agent-settings";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	deduplicateBranchName,
	sanitizeBranchNameWithMaxLength,
	slugifyForBranch,
} from "@superset/shared/workspace-launch";
import { and, eq } from "drizzle-orm";
import { RelayDispatchError, relayMutation } from "./relay-client";

export type DispatchOutcome =
	| { status: "dispatched"; runId: string }
	| { status: "skipped_offline"; runId: string | null; error: string }
	| { status: "dispatch_failed"; runId: string | null; error: string }
	| { status: "conflict" };

export interface DispatchOptions {
	automation: SelectAutomation;
	scheduledFor: Date;
	relayUrl: string;
}

/**
 * Run one automation: resolve host, (maybe) create a workspace, start the
 * agent session. Writes an automation_runs row regardless of outcome. Does
 * NOT touch automations.next_run_at — that advancement is the caller's
 * concern (the cron advances on every tick; runNow intentionally leaves
 * the regular cadence alone).
 */
export async function dispatchAutomation(
	opts: DispatchOptions,
): Promise<DispatchOutcome> {
	const { automation, scheduledFor, relayUrl } = opts;

	const host = await resolveTargetHost(automation);
	if (!host) {
		const error = "no host available";
		const inserted = await recordSkipped(automation, scheduledFor, null, error);
		return { status: "skipped_offline", runId: inserted?.id ?? null, error };
	}
	if (!host.isOnline) {
		const error = "target host offline";
		const inserted = await recordSkipped(
			automation,
			scheduledFor,
			host.machineId,
			error,
		);
		return { status: "skipped_offline", runId: inserted?.id ?? null, error };
	}

	const [run] = await dbWs
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			scheduledFor,
			hostId: host.machineId,
			status: "dispatching",
		})
		.onConflictDoNothing({
			target: [automationRuns.automationId, automationRuns.scheduledFor],
		})
		.returning();

	if (!run) return { status: "conflict" };

	let workspaceId: string | null = null;
	try {
		const [owner] = await dbWs
			.select({ email: users.email })
			.from(users)
			.where(eq(users.id, automation.ownerUserId))
			.limit(1);

		const jwt = await mintUserJwt({
			userId: automation.ownerUserId,
			email: owner?.email,
			organizationIds: [automation.organizationId],
			scope: "automation-run",
			runId: run.id,
			ttlSeconds: 300,
		});

		const routingKey = buildHostRoutingKey(
			automation.organizationId,
			host.machineId,
		);

		if (automation.v2WorkspaceId) {
			workspaceId = automation.v2WorkspaceId;
		} else {
			const created = await createWorkspaceOnHost({
				relayUrl,
				hostId: routingKey,
				jwt,
				projectId: automation.v2ProjectId,
				automation,
				runId: run.id,
			});
			workspaceId = created.workspaceId;
		}

		const agentConfig = automation.agentConfig;
		if (!agentConfig || !agentConfig.enabled) {
			throw new Error(
				`agent preset is disabled: ${agentConfig?.id ?? "unknown"}`,
			);
		}

		if (agentConfig.kind === "chat") {
			const { sessionId } = await dispatchChatSession({
				relayUrl,
				hostId: routingKey,
				jwt,
				workspaceId,
				prompt: automation.prompt,
				model: agentConfig.model ?? undefined,
			});

			await dbWs.insert(chatSessions).values({
				id: sessionId,
				organizationId: automation.organizationId,
				createdBy: automation.ownerUserId,
				v2WorkspaceId: workspaceId,
				title: automation.name,
			});

			await dbWs
				.update(automationRuns)
				.set({
					status: "dispatched",
					sessionKind: "chat",
					chatSessionId: sessionId,
					v2WorkspaceId: workspaceId,
					dispatchedAt: new Date(),
				})
				.where(eq(automationRuns.id, run.id));
		} else {
			const command = buildTerminalCommand({
				prompt: automation.prompt,
				config: agentConfig,
				randomId: run.id,
			});
			const { terminalId } = await dispatchTerminalSession({
				relayUrl,
				hostId: routingKey,
				jwt,
				workspaceId,
				command,
			});
			await dbWs
				.update(automationRuns)
				.set({
					status: "dispatched",
					sessionKind: "terminal",
					terminalSessionId: terminalId,
					v2WorkspaceId: workspaceId,
					dispatchedAt: new Date(),
				})
				.where(eq(automationRuns.id, run.id));
		}
	} catch (err) {
		const error = describeError(err, "dispatch");
		await dbWs
			.update(automationRuns)
			.set({
				status: "dispatch_failed",
				v2WorkspaceId: workspaceId,
				error,
			})
			.where(eq(automationRuns.id, run.id));
		return { status: "dispatch_failed", runId: run.id, error };
	}

	return { status: "dispatched", runId: run.id };
}

async function resolveTargetHost(
	automation: SelectAutomation,
): Promise<typeof v2Hosts.$inferSelect | null> {
	if (automation.targetHostId) {
		const [host] = await dbWs
			.select()
			.from(v2Hosts)
			.where(
				and(
					eq(v2Hosts.organizationId, automation.organizationId),
					eq(v2Hosts.machineId, automation.targetHostId),
				),
			)
			.limit(1);
		return host ?? null;
	}

	const [host] = await dbWs
		.select({
			organizationId: v2Hosts.organizationId,
			machineId: v2Hosts.machineId,
			name: v2Hosts.name,
			isOnline: v2Hosts.isOnline,
			createdByUserId: v2Hosts.createdByUserId,
			createdAt: v2Hosts.createdAt,
			updatedAt: v2Hosts.updatedAt,
		})
		.from(v2Hosts)
		.innerJoin(
			v2UsersHosts,
			and(
				eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
				eq(v2UsersHosts.hostId, v2Hosts.machineId),
			),
		)
		.where(
			and(
				eq(v2UsersHosts.userId, automation.ownerUserId),
				eq(v2Hosts.organizationId, automation.organizationId),
				eq(v2Hosts.isOnline, true),
			),
		)
		.orderBy(v2Hosts.updatedAt)
		.limit(1);

	return host ?? null;
}

async function recordSkipped(
	automation: SelectAutomation,
	scheduledFor: Date,
	hostId: string | null,
	error: string,
): Promise<{ id: string } | undefined> {
	const [row] = await dbWs
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			scheduledFor,
			hostId,
			status: "skipped_offline",
			error,
		})
		.onConflictDoNothing({
			target: [automationRuns.automationId, automationRuns.scheduledFor],
		})
		.returning({ id: automationRuns.id });
	return row;
}

async function createWorkspaceOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	projectId: string;
	automation: SelectAutomation;
	runId: string;
}): Promise<{ workspaceId: string; branchName: string }> {
	// Full-precision timestamp keeps branch names readable AND collision-free
	// for anything coarser than 1 second.
	// e.g. "2026-04-19-17-30-00"
	const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
	const baseSlug = slugifyForBranch(args.automation.name, 30);
	const candidateBranch = sanitizeBranchNameWithMaxLength(
		baseSlug ? `${baseSlug}-${timestamp}` : `automation-${timestamp}`,
		60,
	);
	const branchName = deduplicateBranchName(candidateBranch, []);
	const workspaceName = args.automation.name.slice(0, 100);

	const result = await relayMutation<
		{
			pendingId: string;
			projectId: string;
			names: { workspaceName: string; branchName: string };
			composer: { prompt?: string; runSetupScript?: boolean };
		},
		{
			workspace: { id: string };
			terminals: unknown[];
			warnings: string[];
		}
	>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
			// Workspace creation does git clone + worktree setup — bigger repos
			// can comfortably take >25s. Give it real room.
			timeoutMs: 90_000,
		},
		"workspaceCreation.create",
		{
			pendingId: args.runId,
			projectId: args.projectId,
			names: { workspaceName, branchName },
			composer: { prompt: args.automation.prompt, runSetupScript: false },
		},
	);

	return { workspaceId: result.workspace.id, branchName };
}

async function dispatchChatSession(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	workspaceId: string;
	prompt: string;
	model: string | undefined;
}): Promise<{ sessionId: string }> {
	const sessionId = crypto.randomUUID();
	await relayMutation<
		{
			sessionId: string;
			workspaceId: string;
			payload: { content: string };
			metadata?: { model?: string };
		},
		{ sessionId: string; messageId: string }
	>(
		{ relayUrl: args.relayUrl, hostId: args.hostId, jwt: args.jwt },
		"chat.sendMessage",
		{
			sessionId,
			workspaceId: args.workspaceId,
			payload: { content: args.prompt },
			metadata: args.model ? { model: args.model } : undefined,
		},
	);
	return { sessionId };
}

async function dispatchTerminalSession(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	workspaceId: string;
	command: string;
}): Promise<{ terminalId: string }> {
	const terminalId = crypto.randomUUID();
	await relayMutation<
		{
			terminalId: string;
			workspaceId: string;
			initialCommand?: string;
		},
		{ terminalId: string; status: string }
	>(
		{ relayUrl: args.relayUrl, hostId: args.hostId, jwt: args.jwt },
		"terminal.ensureSession",
		{
			terminalId,
			workspaceId: args.workspaceId,
			initialCommand: args.command,
		},
	);
	return { terminalId };
}

function buildTerminalCommand(args: {
	prompt: string;
	config: TerminalResolvedAgentConfig;
	randomId: string;
}): string {
	const command = args.prompt
		? buildPromptCommandFromAgentConfig({
				prompt: args.prompt,
				randomId: args.randomId,
				config: args.config,
			})
		: getCommandFromAgentConfig(args.config);

	if (!command) {
		throw new Error(`no command configured for agent "${args.config.id}"`);
	}
	return command;
}

function describeError(err: unknown, context: string): string {
	if (err instanceof RelayDispatchError) return `${context}: ${err.message}`;
	if (err instanceof Error) return `${context}: ${err.message}`;
	return `${context}: unknown error`;
}
