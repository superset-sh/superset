import { mintUserJwt } from "@superset/auth/server";
import { db } from "@superset/db/client";
import type { AutomationRunErrorCode } from "@superset/db/enums";
import {
	automationEvents,
	automationRuns,
	githubRepositories,
	type SelectAutomation,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
} from "@superset/db/schema";
import { CLOUD_AGENT_PROMPT_MAX_LENGTH } from "@superset/shared/cloud-agent-launch";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import {
	buildHostRoutingKey,
	CLOUD_HOST_ID,
} from "@superset/shared/host-routing";
import {
	deduplicateBranchName,
	sanitizeBranchNameWithMaxLength,
	slugifyForBranch,
} from "@superset/shared/workspace-launch";
import { and, eq, sql } from "drizzle-orm";
import { nudge } from "../../lib/realtime";
import { fetchRelayPresence } from "../../lib/relay-presence";
import { runInCloud } from "./cloudDispatch";
import { RelayDispatchError, relayMutation } from "./relay-client";
import {
	type AgentRunResult,
	classifyDispatchError,
	describeError,
	nonForkPullRequest,
	previousRunTerminal,
	type RunWorkspace,
	replacePin,
} from "./run";
import { promptWithTriggerContext } from "./triggerContext";

export type DispatchOutcome =
	| { status: "dispatched"; runId: string }
	| {
			status: "skipped_offline";
			runId: string | null;
			error: string;
			errorCode: AutomationRunErrorCode | null;
	  }
	| {
			status: "dispatch_failed";
			runId: string | null;
			error: string;
			errorCode: AutomationRunErrorCode | null;
	  }
	| { status: "conflict" };

/**
 * Only what dispatch actually reads. Deliberately excludes the schedule
 * columns, which live on the automation's trigger.
 */
export type DispatchableAutomation = Pick<
	SelectAutomation,
	| "id"
	| "name"
	| "organizationId"
	| "ownerUserId"
	| "agent"
	| "prompt"
	| "targetHostId"
	| "v2ProjectId"
	| "v2WorkspaceId"
	| "cloudWorkspaceId"
	| "environmentId"
	| "tags"
	| "continueAgentSession"
>;

/**
 * What caused this run: a schedule with a due minute (and the schedule trigger
 * that was due, when the caller knows it), or a matched event.
 */
export type DispatchCause =
	| { scheduledFor: Date; triggerId?: string; trigger?: null }
	| {
			scheduledFor?: null;
			triggerId?: null;
			trigger: { triggerId: string; eventId: string };
	  };

export type DispatchOptions = {
	automation: DispatchableAutomation;
	relayUrl: string;
} & DispatchCause;

/**
 * The columns a candidate is built from, named once so both queries below
 * project the same ones. A bare `.select()` would instead project whatever the
 * schema currently declares, which couples dispatch to columns it never reads:
 * a column dropped from `v2_hosts` breaks every deployment still running the
 * previous build, since it goes on selecting a column the database no longer
 * has.
 */
const hostCandidateColumns = {
	organizationId: v2Hosts.organizationId,
	machineId: v2Hosts.machineId,
	name: v2Hosts.name,
	wakeCommand: v2Hosts.wakeCommand,
	createdByUserId: v2Hosts.createdByUserId,
	createdAt: v2Hosts.createdAt,
	updatedAt: v2Hosts.updatedAt,
};

type HostCandidate = Pick<
	typeof v2Hosts.$inferSelect,
	keyof typeof hostCandidateColumns
>;

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
	const { automation, relayUrl } = opts;
	const cause = runCause(opts);

	// An automation created from the detail page starts without instructions; a
	// trigger can be armed before they're written, so refuse to run instead of
	// starting an agent session with an empty prompt.
	if (automation.prompt.trim().length === 0) {
		const error = "automation has no instructions";
		const inserted = await recordUndispatched(
			automation,
			cause,
			automation.targetHostId,
			"dispatch_failed",
			error,
			"no_instructions",
		);
		return {
			status: "dispatch_failed",
			runId: inserted?.id ?? null,
			error,
			errorCode: "no_instructions",
		};
	}

	if (automation.targetHostId === CLOUD_HOST_ID) {
		return dispatchRun(
			automation,
			cause,
			CLOUD_HOST_ID,
			async (_run, placed) => {
				const event = await causeEvent(cause);
				return runInCloud({
					automation,
					prompt: runPrompt(
						automation,
						cause,
						event,
						CLOUD_AGENT_PROMPT_MAX_LENGTH,
					),
					event,
					placed,
				});
			},
		);
	}

	const candidates = await resolveCandidateHosts(automation);
	if (candidates.length === 0) {
		const error = "no host available";
		const inserted = await recordUndispatched(
			automation,
			cause,
			null,
			"skipped_offline",
			error,
			"host_offline",
		);
		return {
			status: "skipped_offline",
			runId: inserted?.id ?? null,
			error,
			errorCode: "host_offline",
		};
	}

	const host = await pickOnlineHost(automation, relayUrl, candidates);
	if (!host) {
		const error = "target host offline";
		const inserted = await recordUndispatched(
			automation,
			cause,
			candidates[0]?.machineId ?? null,
			"skipped_offline",
			error,
			"host_offline",
		);
		return {
			status: "skipped_offline",
			runId: inserted?.id ?? null,
			error,
			errorCode: "host_offline",
		};
	}

	return dispatchRun(automation, cause, host.machineId, async (run, placed) => {
		const jwt = await mintUserJwt({
			userId: automation.ownerUserId,
			organizationIds: [automation.organizationId],
			scope: "automation-run",
			runId: run.id,
			ttlSeconds: 300,
		});

		const routingKey = buildHostRoutingKey(
			automation.organizationId,
			host.machineId,
		);

		const event = await causeEvent(cause);
		const pullRequest = event
			? await pullRequestToCheckOut(event, automation.v2ProjectId)
			: null;

		const createFreshWorkspace = async () => {
			const created = await createWorkspaceOnHost({
				relayUrl,
				hostId: routingKey,
				jwt,
				projectId: automation.v2ProjectId,
				automation,
				runId: run.id,
				pullRequest,
			});
			placed({ v2WorkspaceId: created.workspaceId });
			return created.workspaceId;
		};

		const prompt = runPrompt(automation, cause, event);

		// Opt-in, and only for a pinned workspace: that is where a session from
		// a previous run can still be alive.
		const continueTerminalId =
			automation.continueAgentSession && automation.v2WorkspaceId
				? await previousRunTerminal(automation.id, {
						v2WorkspaceId: automation.v2WorkspaceId,
					})
				: undefined;

		const runAgent = (targetWorkspaceId: string) =>
			runAgentOnHost({
				relayUrl,
				hostId: routingKey,
				jwt,
				workspaceId: targetWorkspaceId,
				agent: automation.agent,
				prompt,
				// Only the pinned workspace holds that session; the stale-pin
				// recovery below branches a fresh one, which has none.
				...(continueTerminalId && targetWorkspaceId === automation.v2WorkspaceId
					? { continueTerminalId }
					: {}),
			});

		const stalePin = automation.v2WorkspaceId;
		if (stalePin) placed({ v2WorkspaceId: stalePin });
		const workspaceId = stalePin ?? (await createFreshWorkspace());

		try {
			return await runAgent(workspaceId);
		} catch (err) {
			// Fall back only when the host says the pinned workspace is gone:
			// tRPC NOT_FOUND (404) naming the pinned id. Other NOT_FOUNDs
			// (agent config, attachments) rethrow.
			const pinGone =
				stalePin !== null &&
				stalePin === workspaceId &&
				err instanceof RelayDispatchError &&
				err.status === 404 &&
				err.message.includes(stalePin);
			if (!pinGone) throw err;
			await replacePin(automation.id, { v2WorkspaceId: stalePin }, null);
			// Don't let a failed fresh create record the dead id.
			placed(null);
			return runAgent(await createFreshWorkspace());
		}
	});
}

/** Inserts the run and always settles it, so no run stays in `dispatching`. */
async function dispatchRun(
	automation: DispatchableAutomation,
	cause: RunCause,
	hostId: string,
	start: (
		run: { id: string },
		placed: (workspace: RunWorkspace | null) => void,
	) => Promise<AgentRunResult | null>,
): Promise<DispatchOutcome> {
	const [run] = await db
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			...cause,
			hostId,
			status: "dispatching",
		})
		.onConflictDoNothing(runDedupTarget(cause))
		.returning();

	if (!run) return { status: "conflict" };

	let workspace = null as RunWorkspace | null;
	try {
		const session = await start(run, (placed) => {
			workspace = placed;
		});
		await db
			.update(automationRuns)
			.set({
				status: "dispatched",
				sessionKind: session?.kind ?? null,
				chatSessionId: null,
				terminalSessionId: session?.sessionId ?? null,
				...workspace,
				dispatchedAt: new Date(),
			})
			.where(eq(automationRuns.id, run.id));
	} catch (err) {
		const error = describeError(err, "dispatch");
		const errorCode = classifyDispatchError(err);
		await db
			.update(automationRuns)
			.set({ status: "dispatch_failed", ...workspace, error, errorCode })
			.where(eq(automationRuns.id, run.id));
		nudge(automation.organizationId, "automation_runs");
		return { status: "dispatch_failed", runId: run.id, error, errorCode };
	}

	nudge(automation.organizationId, "automation_runs");
	return { status: "dispatched", runId: run.id };
}

function runPrompt(
	automation: DispatchableAutomation,
	cause: RunCause,
	event: Awaited<ReturnType<typeof causeEvent>>,
	maxLength?: number,
): string {
	return promptWithTriggerContext(
		automation.prompt,
		{
			automationId: automation.id,
			triggerId: cause.triggerId,
			scheduledFor: cause.scheduledFor,
		},
		event,
		maxLength,
	);
}

async function causeEvent(cause: RunCause) {
	if (!cause.eventId) return null;
	return (
		(await db.query.automationEvents.findFirst({
			where: eq(automationEvents.id, cause.eventId),
			columns: {
				provider: true,
				eventType: true,
				title: true,
				url: true,
				actorLogin: true,
				ref: true,
				repositoryId: true,
				payload: true,
				receivedAt: true,
			},
		})) ?? null
	);
}

async function resolveCandidateHosts(
	automation: DispatchableAutomation,
): Promise<HostCandidate[]> {
	if (automation.targetHostId) {
		const [host] = await db
			.select(hostCandidateColumns)
			.from(v2Hosts)
			.where(
				and(
					eq(v2Hosts.organizationId, automation.organizationId),
					eq(v2Hosts.machineId, automation.targetHostId),
				),
			)
			.limit(1);

		return host ? [host] : [];
	}

	return db
		.select(hostCandidateColumns)
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
		.orderBy(v2Hosts.updatedAt);
}

/**
 * The relay's Durable Objects are the presence authority. First online
 * candidate wins, preserving the updatedAt ordering.
 */
async function pickOnlineHost(
	automation: DispatchableAutomation,
	relayUrl: string,
	candidates: HostCandidate[],
): Promise<HostCandidate | null> {
	const jwt = await mintUserJwt({
		userId: automation.ownerUserId,
		organizationIds: [automation.organizationId],
		scope: "automation-presence",
		ttlSeconds: 60,
	});
	const presence = await fetchRelayPresence(
		relayUrl,
		jwt,
		candidates.map((host) =>
			buildHostRoutingKey(host.organizationId, host.machineId),
		),
	);
	return (
		candidates.find((host) => {
			const info =
				presence?.[buildHostRoutingKey(host.organizationId, host.machineId)];
			return info?.online ?? false;
		}) ?? null
	);
}

/** The run row columns that identify the cause, in either shape. */
type RunCause = {
	scheduledFor: Date | null;
	triggerId: string | null;
	eventId: string | null;
};

function runCause(opts: DispatchCause): RunCause {
	if (opts.trigger) {
		return {
			scheduledFor: null,
			triggerId: opts.trigger.triggerId,
			eventId: opts.trigger.eventId,
		};
	}
	return {
		scheduledFor: opts.scheduledFor,
		triggerId: opts.triggerId ?? null,
		eventId: null,
	};
}

/**
 * The partial unique index a run of this shape can collide on:
 * automation_runs_schedule_dedup_idx for scheduled runs,
 * automation_runs_event_dedup_idx for event runs. Postgres only matches
 * ON CONFLICT against an index whose predicate the target clause repeats,
 * so the two shapes need different targets, not one that names both.
 */
function runDedupTarget(cause: RunCause) {
	return cause.eventId !== null
		? {
				target: [automationRuns.triggerId, automationRuns.eventId],
				where: sql`${automationRuns.eventId} IS NOT NULL`,
			}
		: {
				target: [automationRuns.automationId, automationRuns.scheduledFor],
				where: sql`${automationRuns.scheduledFor} IS NOT NULL`,
			};
}

/** Records a run that never reached a host, so the failure is visible. */
async function recordUndispatched(
	automation: DispatchableAutomation,
	cause: RunCause,
	hostId: string | null,
	status: "skipped_offline" | "dispatch_failed",
	error: string,
	errorCode: AutomationRunErrorCode,
): Promise<{ id: string } | undefined> {
	const [row] = await db
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			...cause,
			hostId,
			status,
			error,
			errorCode,
		})
		.onConflictDoNothing(runDedupTarget(cause))
		.returning({ id: automationRuns.id });
	if (row) nudge(automation.organizationId, "automation_runs");
	return row;
}

/**
 * The pull request a run should be checked out on, or null to branch fresh.
 *
 * Only when the automation's project really is the event's repository: a
 * trigger watching one repo can dispatch into a project pointed at another,
 * and PR numbers are per-repository, so an unchecked number would check out
 * an unrelated pull request.
 *
 * `pr` has been on `workspaces.create` since 0.1.0, well under the host floor,
 * so there is no version to gate on.
 */
async function pullRequestToCheckOut(
	event: { provider: string; repositoryId: string | null; payload: unknown },
	projectId: string | null,
): Promise<number | null> {
	// A session automation has no project, and so no repository to check out in.
	if (projectId === null || event.repositoryId === null) return null;
	const pullRequest = nonForkPullRequest(event);
	if (!pullRequest) return null;

	const [project] = await db
		.select({ repoCloneUrl: v2Projects.repoCloneUrl })
		.from(v2Projects)
		.where(eq(v2Projects.id, projectId))
		.limit(1);
	const parsed = project?.repoCloneUrl
		? parseGitHubRemote(project.repoCloneUrl)
		: null;
	if (!parsed) return null;

	const [repository] = await db
		.select({ fullName: githubRepositories.fullName })
		.from(githubRepositories)
		.where(eq(githubRepositories.repoId, event.repositoryId))
		.limit(1);
	if (!repository) return null;

	// GitHub slugs are case-insensitive, on both sides of the comparison.
	return repository.fullName.toLowerCase() ===
		`${parsed.owner}/${parsed.name}`.toLowerCase()
		? pullRequest.number
		: null;
}

async function createWorkspaceOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	projectId: string | null;
	automation: DispatchableAutomation;
	runId: string;
	/** The event's pull request, checked out instead of a fresh branch. */
	pullRequest: number | null;
}): Promise<{ workspaceId: string }> {
	// Session automation: no project, no branch. The host allocates a managed
	// folder under ~/.superset/sessions and dedupes the name per run.
	if (args.projectId === null) {
		const result = await relayMutation<
			{ name: string; tags?: string[] },
			{ workspace: { id: string } }
		>(
			{
				relayUrl: args.relayUrl,
				hostId: args.hostId,
				jwt: args.jwt,
				timeoutMs: 90_000,
			},
			"workspaces.createSession",
			{
				name: args.automation.name.slice(0, 100),
				...(args.automation.tags.length > 0
					? { tags: args.automation.tags }
					: {}),
			},
		);
		return { workspaceId: result.workspace.id };
	}

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
	// Captured: the null check above does not narrow a property read inside
	// the closure below.
	const projectId = args.projectId;

	const create = (target: { branch: string } | { pr: number }) =>
		relayMutation<
			{
				projectId: string;
				name: string;
				branch?: string;
				pr?: number;
				tags?: string[];
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
				projectId,
				name: workspaceName,
				...target,
				// An older host's create schema simply strips the unknown key.
				...(args.automation.tags.length > 0
					? { tags: args.automation.tags }
					: {}),
			},
		);

	if (args.pullRequest !== null) {
		try {
			// The host fetches the PR's verified head and reuses the workspace
			// already on that branch, so repeated events on one PR share it.
			const result = await create({ pr: args.pullRequest });
			return { workspaceId: result.workspace.id };
		} catch (err) {
			// Fall back only when the host itself answered and refused, which
			// is what a missing or expired `gh auth login` looks like. A
			// timeout or transport failure is not a RelayDispatchError and
			// leaves the workspace's existence unknown: branching fresh there
			// would orphan a PR workspace the host may have finished creating
			// and run the automation against the wrong target. Rethrow, so the
			// retry meets the host's own per-PR dedupe instead.
			if (!(err instanceof RelayDispatchError)) throw err;
			// Resolving a PR shells out to `gh`, which runs on the user's own
			// `gh auth login` and may be missing or expired on this host. A PR
			// we cannot check out must not turn a run that would otherwise have
			// worked into a failure: branch fresh instead, and let the agent
			// work from the PR its prompt already names.
			console.warn(
				`[automations] PR #${args.pullRequest} checkout failed for ${args.automation.id}; branching fresh:`,
				describeError(err, "pr checkout"),
			);
		}
	}

	const result = await create({ branch: branchName });
	return { workspaceId: result.workspace.id };
}

async function runAgentOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	workspaceId: string;
	agent: string;
	prompt: string;
	/** See {@link previousRunTerminal}. */
	continueTerminalId?: string;
}): Promise<AgentRunResult> {
	return relayMutation<
		{
			workspaceId: string;
			agent: string;
			prompt: string;
			continueTerminalId?: string;
		},
		AgentRunResult
	>(
		{ relayUrl: args.relayUrl, hostId: args.hostId, jwt: args.jwt },
		"agents.run",
		{
			workspaceId: args.workspaceId,
			agent: args.agent,
			prompt: args.prompt,
			// A host that predates this strips the unknown key and launches,
			// which is exactly what every host did before it existed.
			...(args.continueTerminalId
				? { continueTerminalId: args.continueTerminalId }
				: {}),
		},
	);
}
