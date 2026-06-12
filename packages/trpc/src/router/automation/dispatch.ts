import { mintUserJwt } from "@superset/auth/server";
import { dbWs } from "@superset/db/client";
import {
	automationRuns,
	type SelectAutomation,
	users,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	deduplicateBranchName,
	sanitizeBranchNameWithMaxLength,
	slugifyForBranch,
} from "@superset/shared/workspace-launch";
import { and, eq } from "drizzle-orm";
import { RelayDispatchError, relayMutation } from "./relay-client";

type AgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

export type DispatchOutcome =
	| { status: "running"; runId: string }
	| { status: "skipped"; runId: string | null; error: string }
	| { status: "failed"; runId: string | null; error: string }
	| { status: "conflict" };

export interface DispatchOptions {
	automation: SelectAutomation;
	scheduledFor: Date;
	relayUrl: string;
	apiUrl: string;
	source: "manual" | "schedule";
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

	const resolved = await resolveTargetHost(automation);
	if (!resolved) {
		const error = "no host available";
		const inserted = await recordSkipped(
			automation,
			scheduledFor,
			null,
			error,
			opts.source,
		);
		return { status: "skipped", runId: inserted?.id ?? null, error };
	}
	const host = resolved;
	if (!host.isOnline) {
		const error = "target host offline";
		const inserted = await recordSkipped(
			automation,
			scheduledFor,
			host.machineId,
			error,
			opts.source,
		);
		return { status: "skipped", runId: inserted?.id ?? null, error };
	}

	const [run] = await dbWs
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			source: opts.source,
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

		const relayJwt = await mintUserJwt({
			userId: automation.ownerUserId,
			email: owner?.email,
			organizationIds: [automation.organizationId],
			scope: "automation-run",
			runId: run.id,
			ttlSeconds: 300,
		});
		const runJwt = await mintUserJwt({
			userId: automation.ownerUserId,
			email: owner?.email,
			organizationIds: [automation.organizationId],
			scope: "automation-run",
			runId: run.id,
			ttlSeconds: 6 * 60 * 60,
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
				jwt: relayJwt,
				projectId: automation.v2ProjectId,
				automation,
				runId: run.id,
			});
			workspaceId = created.workspaceId;
		}

		const result = await runAgentOnHost({
			relayUrl,
			hostId: routingKey,
			jwt: relayJwt,
			workspaceId,
			agent: automation.agent,
			prompt: buildAutomationRunPrompt({
				automationName: automation.name,
				runId: run.id,
				prompt: automation.prompt,
			}),
			env: {
				SUPERSET_API_URL: opts.apiUrl,
				SUPERSET_API_KEY: runJwt,
				SUPERSET_AUTOMATION_ID: automation.id,
				SUPERSET_AUTOMATION_RUN_ID: run.id,
				SUPERSET_AUTOMATION_RUN_SOURCE: opts.source,
				SUPERSET_AUTOMATION_RUN_TOKEN: runJwt,
			},
		});

		await dbWs
			.update(automationRuns)
			.set({
				status: "running",
				sessionKind: result.kind,
				chatSessionId: result.kind === "chat" ? result.sessionId : null,
				terminalSessionId: result.kind === "terminal" ? result.sessionId : null,
				v2WorkspaceId: workspaceId,
				startedAt: new Date(),
				dispatchedAt: new Date(),
			})
			.where(eq(automationRuns.id, run.id));
	} catch (err) {
		const error = describeError(err, "dispatch");
		await dbWs
			.update(automationRuns)
			.set({
				status: "failed",
				v2WorkspaceId: workspaceId,
				error,
				failureReason: error,
				resultSource: "system",
				completedAt: new Date(),
			})
			.where(eq(automationRuns.id, run.id));
		return { status: "failed", runId: run.id, error };
	}

	return { status: "running", runId: run.id };
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
	source: "manual" | "schedule",
): Promise<{ id: string } | undefined> {
	const [row] = await dbWs
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			source,
			scheduledFor,
			hostId,
			status: "skipped",
			error,
			failureReason: error,
			resultSource: "system",
			completedAt: new Date(),
		})
		.onConflictDoNothing({
			target: [automationRuns.automationId, automationRuns.scheduledFor],
		})
		.returning({ id: automationRuns.id });
	if (row) return row;

	const [existing] = await dbWs
		.select({ id: automationRuns.id })
		.from(automationRuns)
		.where(
			and(
				eq(automationRuns.automationId, automation.id),
				eq(automationRuns.scheduledFor, scheduledFor),
			),
		)
		.limit(1);
	return existing;
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
			projectId: string;
			name: string;
			branch: string;
		},
		{
			workspace: {
				id: string;
				projectId: string;
				name: string;
				branch: string;
			};
			terminals: Array<{ terminalId: string; label?: string }>;
			agents: Array<unknown>;
			alreadyExists: boolean;
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
		"workspaces.create",
		{
			projectId: args.projectId,
			name: workspaceName,
			branch: branchName,
		},
	);

	return { workspaceId: result.workspace.id, branchName };
}

async function runAgentOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	workspaceId: string;
	agent: string;
	prompt: string;
	env?: Record<string, string>;
}): Promise<AgentRunResult> {
	return relayMutation<
		{
			workspaceId: string;
			agent: string;
			prompt: string;
			env?: Record<string, string>;
		},
		AgentRunResult
	>(
		{ relayUrl: args.relayUrl, hostId: args.hostId, jwt: args.jwt },
		"agents.run",
		{
			workspaceId: args.workspaceId,
			agent: args.agent,
			prompt: args.prompt,
			env: args.env,
		},
	);
}

function buildAutomationRunPrompt(args: {
	automationName: string;
	runId: string;
	prompt: string;
}): string {
	return `${args.prompt.trim()}

---

# Superset Automation Run

You are running the Superset automation "${args.automationName}".

Run id: ${args.runId}

When the work is complete:

1. Write a concise Markdown report with the final result.
2. Save it to a temporary markdown file.
3. Mark this run complete with:

\`\`\`bash
superset automations runs complete ${args.runId} --result-file /path/to/report.md
\`\`\`

If the work fails, mark the run failed with:

\`\`\`bash
superset automations runs fail ${args.runId} --reason "short failure reason"
\`\`\`

The environment includes SUPERSET_AUTOMATION_RUN_ID, SUPERSET_AUTOMATION_RUN_TOKEN, SUPERSET_API_KEY, and SUPERSET_API_URL for this run.
Do not create your own cron job, scheduled reminder, recurring task, or background scheduler. This process is already being triggered by Superset Automations.`;
}

function describeError(err: unknown, context: string): string {
	if (err instanceof RelayDispatchError) return `${context}: ${err.message}`;
	if (err instanceof Error) return `${context}: ${err.message}`;
	return `${context}: unknown error`;
}
