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
import { and, desc, eq } from "drizzle-orm";
import { chooseAutomationAgentForHost } from "./dispatch-agent-selection";
import { describeDispatchError } from "./dispatch-errors";
import { relayMutation, relayQuery } from "./relay-client";

type AgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string }
	| {
			kind: "automation";
			sessionId: string;
			label: string;
			runDirectory: string;
			pid: number;
	  };

interface HostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
	env: Record<string, string>;
	order: number;
}

export type DispatchOutcome =
	| { status: "dispatching"; runId: string }
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

type SelectedAutomationHost = typeof v2Hosts.$inferSelect;

type PreparedDispatch =
	| { status: "conflict" }
	| { status: "skipped"; runId: string | null; error: string }
	| {
			status: "dispatching";
			runId: string;
			run: typeof automationRuns.$inferSelect;
			host: SelectedAutomationHost;
			options: DispatchOptions;
	  };

interface DispatchTimingStage {
	stage: string;
	elapsedMs: number;
	deltaMs: number;
}

interface DispatchTimer {
	mark(stage: string): void;
	finish(status: DispatchOutcome["status"], error?: string): void;
}

function createDispatchTimer(args: {
	automationId: string;
	runId: string;
	source: "manual" | "schedule";
	startedAt?: number;
}): DispatchTimer {
	const startedAt = args.startedAt ?? Date.now();
	let lastMarkAt = startedAt;
	const stages: DispatchTimingStage[] = [];

	return {
		mark(stage) {
			const now = Date.now();
			stages.push({
				stage,
				elapsedMs: now - startedAt,
				deltaMs: now - lastMarkAt,
			});
			lastMarkAt = now;
		},
		finish(status, error) {
			const totalMs = Date.now() - startedAt;
			if (totalMs < 500 && !error) return;

			console.info("[automation-dispatch] timing", {
				automationId: args.automationId,
				runId: args.runId,
				source: args.source,
				status,
				totalMs,
				stages,
				error,
			});
		},
	};
}

/**
 * Run one automation: resolve host and start the host-service Automation
 * runner. Writes an automation_runs row regardless of outcome. Does
 * NOT touch automations.next_run_at — that advancement is the caller's
 * concern (the cron advances on every tick; runNow intentionally leaves
 * the regular cadence alone).
 */
export async function dispatchAutomation(
	opts: DispatchOptions,
): Promise<DispatchOutcome> {
	const prepared = await prepareAutomationDispatch(opts);
	if (prepared.status !== "dispatching") return prepared;

	return continueAutomationDispatch(prepared);
}

/**
 * Start a manual automation run without waiting for host/agent startup.
 *
 * The returned run row is real and durable (`status = "dispatching"`). The
 * heavier dispatch work continues against the same row and moves it to
 * `running` or `failed`. This keeps the user-facing API responsive without
 * pretending the agent is already running.
 */
export async function startAutomationDispatch(
	opts: DispatchOptions,
): Promise<DispatchOutcome> {
	const startedAt = Date.now();
	const run = await recordDispatchingRun({
		automation: opts.automation,
		scheduledFor: opts.scheduledFor,
		hostId: null,
		source: opts.source,
	});

	if (!run) return { status: "conflict" };

	const timer = createDispatchTimer({
		automationId: opts.automation.id,
		runId: run.id,
		source: opts.source,
		startedAt,
	});
	timer.mark("run-row-created");

	void continueCreatedAutomationDispatch({ run, options: opts, timer }).catch(
		(error) => {
			console.error("[automation-dispatch] background dispatch failed", {
				automationId: opts.automation.id,
				runId: run.id,
				error: error instanceof Error ? error.message : String(error),
			});
		},
	);

	return { status: "dispatching", runId: run.id };
}

async function prepareAutomationDispatch(
	opts: DispatchOptions,
): Promise<PreparedDispatch> {
	const { automation, scheduledFor } = opts;

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

	const run = await recordDispatchingRun({
		automation,
		scheduledFor,
		hostId: host.machineId,
		source: opts.source,
	});

	if (!run) return { status: "conflict" };

	return {
		status: "dispatching",
		runId: run.id,
		run,
		host,
		options: opts,
	};
}

async function continueCreatedAutomationDispatch(args: {
	run: typeof automationRuns.$inferSelect;
	options: DispatchOptions;
	timer: DispatchTimer;
}): Promise<DispatchOutcome> {
	const {
		run,
		options: { automation },
		timer,
	} = args;

	try {
		const host = await resolveTargetHost(automation);
		timer.mark("host-resolved");

		if (!host) {
			const error = "no host available";
			const outcome = await markDispatchRunSkipped({
				runId: run.id,
				hostId: null,
				error,
			});
			timer.finish("skipped", error);
			return outcome;
		}

		if (!host.isOnline) {
			const error = "target host offline";
			const outcome = await markDispatchRunSkipped({
				runId: run.id,
				hostId: host.machineId,
				error,
			});
			timer.finish("skipped", error);
			return outcome;
		}

		return continueAutomationDispatch(
			{
				status: "dispatching",
				runId: run.id,
				run,
				host,
				options: args.options,
			},
			timer,
		);
	} catch (err) {
		const error = describeDispatchError(err, "dispatch");
		const outcome = await markDispatchRunFailed({
			runId: run.id,
			error,
		});
		timer.finish("failed", error);
		return outcome;
	}
}

async function continueAutomationDispatch(
	prepared: Extract<PreparedDispatch, { status: "dispatching" }>,
	timer?: DispatchTimer,
): Promise<DispatchOutcome> {
	const { run, host, options: opts } = prepared;
	const { automation, relayUrl } = opts;
	try {
		const [owner] = await dbWs
			.select({ email: users.email })
			.from(users)
			.where(eq(users.id, automation.ownerUserId))
			.limit(1);

		const [relayJwt, runJwt] = await Promise.all([
			mintUserJwt({
				userId: automation.ownerUserId,
				email: owner?.email,
				organizationIds: [automation.organizationId],
				scope: "automation-run",
				runId: run.id,
				ttlSeconds: 300,
			}),
			mintUserJwt({
				userId: automation.ownerUserId,
				email: owner?.email,
				organizationIds: [automation.organizationId],
				scope: "automation-run",
				runId: run.id,
				ttlSeconds: 6 * 60 * 60,
			}),
		]);
		timer?.mark("jwt-minted");

		const routingKey = buildHostRoutingKey(
			automation.organizationId,
			host.machineId,
		);
		const agent = await resolveAutomationAgentForHost({
			automation,
			selectedHostMachineId: host.machineId,
			selectedHostRoutingKey: routingKey,
			relayUrl,
			jwt: relayJwt,
		});
		timer?.mark("agent-resolved");

		const result = await runAgentOnHost({
			relayUrl,
			hostId: routingKey,
			jwt: relayJwt,
			runId: run.id,
			automationId: automation.id,
			agent,
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
		timer?.mark("automation-runner-started");

		await dbWs
			.update(automationRuns)
			.set({
				status: "running",
				hostId: host.machineId,
				sessionKind: result.kind === "automation" ? null : result.kind,
				chatSessionId: result.kind === "chat" ? result.sessionId : null,
				terminalSessionId: result.kind === "terminal" ? result.sessionId : null,
				v2WorkspaceId: null,
				startedAt: new Date(),
				dispatchedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(automationRuns.id, run.id));
		timer?.finish("running");
	} catch (err) {
		const error = describeDispatchError(err, "dispatch");
		await markDispatchRunFailed({ runId: run.id, error });
		timer?.finish("failed", error);
		return { status: "failed", runId: run.id, error };
	}

	return { status: "running", runId: run.id };
}

async function recordDispatchingRun(args: {
	automation: SelectAutomation;
	scheduledFor: Date;
	hostId: string | null;
	source: "manual" | "schedule";
}): Promise<typeof automationRuns.$inferSelect | undefined> {
	const [run] = await dbWs
		.insert(automationRuns)
		.values({
			automationId: args.automation.id,
			organizationId: args.automation.organizationId,
			title: args.automation.name,
			source: args.source,
			scheduledFor: args.scheduledFor,
			hostId: args.hostId,
			status: "dispatching",
		})
		.onConflictDoNothing({
			target: [automationRuns.automationId, automationRuns.scheduledFor],
		})
		.returning();

	return run;
}

async function markDispatchRunSkipped(args: {
	runId: string;
	hostId: string | null;
	error: string;
}): Promise<DispatchOutcome> {
	const now = new Date();
	await dbWs
		.update(automationRuns)
		.set({
			status: "skipped",
			hostId: args.hostId,
			error: args.error,
			failureReason: args.error,
			resultSource: "system",
			completedAt: now,
			updatedAt: now,
		})
		.where(eq(automationRuns.id, args.runId));

	return { status: "skipped", runId: args.runId, error: args.error };
}

async function markDispatchRunFailed(args: {
	runId: string;
	error: string;
}): Promise<DispatchOutcome> {
	const now = new Date();
	await dbWs
		.update(automationRuns)
		.set({
			status: "failed",
			v2WorkspaceId: null,
			error: args.error,
			failureReason: args.error,
			resultSource: "system",
			completedAt: now,
			updatedAt: now,
		})
		.where(eq(automationRuns.id, args.runId));

	return { status: "failed", runId: args.runId, error: args.error };
}

async function resolveAutomationAgentForHost(args: {
	automation: SelectAutomation;
	selectedHostMachineId: string;
	selectedHostRoutingKey: string;
	relayUrl: string;
	jwt: string;
}): Promise<string> {
	const agent = args.automation.agent;
	if (agent === "superset") return agent;

	const targetConfigs = await listAgentConfigsOnHost({
		relayUrl: args.relayUrl,
		hostId: args.selectedHostRoutingKey,
		jwt: args.jwt,
	});

	const sourceHostId = args.automation.targetHostId;
	const needsSourceLookup =
		sourceHostId &&
		sourceHostId !== args.selectedHostMachineId &&
		!targetConfigs.some((config) => config.id === agent) &&
		!targetConfigs.some((config) => config.presetId === agent);
	const sourceConfigs = needsSourceLookup
		? await listAgentConfigsOnHost({
				relayUrl: args.relayUrl,
				hostId: buildHostRoutingKey(
					args.automation.organizationId,
					sourceHostId,
				),
				jwt: args.jwt,
			})
		: [];

	return chooseAutomationAgentForHost({
		agent,
		selectedHostMachineId: args.selectedHostMachineId,
		sourceHostId,
		targetConfigs,
		sourceConfigs,
	});
}

async function listAgentConfigsOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
}): Promise<HostAgentConfig[]> {
	return relayQuery<HostAgentConfig[]>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
			timeoutMs: 20_000,
		},
		"settings.agentConfigs.list",
	);
}

async function resolveTargetHost(
	automation: SelectAutomation,
): Promise<typeof v2Hosts.$inferSelect | null> {
	const accessibleHosts = await dbWs
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
			),
		)
		.orderBy(desc(v2Hosts.isOnline), desc(v2Hosts.updatedAt));

	const requested = automation.targetHostId
		? (accessibleHosts.find(
				(host) => host.machineId === automation.targetHostId,
			) ?? null)
		: null;

	return (
		requested ??
		accessibleHosts.find((host) => host.isOnline) ??
		accessibleHosts[0] ??
		null
	);
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

async function runAgentOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	runId: string;
	automationId: string;
	agent: string;
	prompt: string;
	env?: Record<string, string>;
}): Promise<AgentRunResult> {
	return relayMutation<
		{
			runId: string;
			automationId: string;
			agent: string;
			prompt: string;
			env?: Record<string, string>;
		},
		AgentRunResult
	>(
		{ relayUrl: args.relayUrl, hostId: args.hostId, jwt: args.jwt },
		"agents.runAutomation",
		{
			runId: args.runId,
			automationId: args.automationId,
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
