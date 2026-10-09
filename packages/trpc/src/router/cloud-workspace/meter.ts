import { db } from "@superset/db/client";
import {
	cloudWorkspaceSessions,
	cloudWorkspaces,
	organizations,
} from "@superset/db/schema";
import { and, count, eq, inArray, isNull, lt, max, or, sql } from "drizzle-orm";
import { autumn, BOX_MINUTES_FEATURE_ID } from "../../lib/billing/autumn";
import {
	listActiveWorkspaceSandboxes,
	listSandboxSessions,
	type SandboxSession,
} from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";

export const STANDARD_BOX_VCPUS = 4;
const MIN_RUNNING_REPORT_MS = 60_000;
const RECONCILE_LOOKBACK_MS = 30 * 60 * 1000;
const RECONCILE_CONCURRENCY = 10;

type SessionRow = typeof cloudWorkspaceSessions.$inferSelect;

export function boxMinutes(ms: number, vcpus: number): number {
	return (ms / 60_000) * (vcpus / STANDARD_BOX_VCPUS);
}

export function observedMs(session: SandboxSession, now: number): number {
	return Math.max(0, (session.endedAt ?? now) - session.startedAt);
}

export function unreportedMs(row: SessionRow): number {
	const delta = row.observedMs - row.reportedMs;
	if (row.stoppedAt === null && delta < MIN_RUNNING_REPORT_MS) return 0;
	return Math.max(0, delta);
}

export function meteringCutoff(bounds: {
	oldestOpenStart: Date | null;
	lastStop: Date | null;
	workspaceCreatedAt: Date;
}): number {
	return (
		bounds.oldestOpenStart ??
		bounds.lastStop ??
		bounds.workspaceCreatedAt
	).getTime();
}

async function recordSessions(workspace: {
	id: string;
	providerSandboxId: string;
	createdAt: Date;
}): Promise<void> {
	const [bounds] = await db
		.select({
			oldestOpenStart:
				sql<Date | null>`min(${cloudWorkspaceSessions.startedAt}) filter (where ${cloudWorkspaceSessions.stoppedAt} is null)`.mapWith(
					cloudWorkspaceSessions.startedAt,
				),
			lastStop: max(cloudWorkspaceSessions.stoppedAt),
			count: count(),
		})
		.from(cloudWorkspaceSessions)
		.where(eq(cloudWorkspaceSessions.cloudWorkspaceId, workspace.id));
	const firstSight = (bounds?.count ?? 0) === 0;
	const sessions = await listSandboxSessions(
		workspace.providerSandboxId,
		meteringCutoff({
			oldestOpenStart: bounds?.oldestOpenStart ?? null,
			lastStop: bounds?.lastStop ?? null,
			workspaceCreatedAt: workspace.createdAt,
		}),
	);
	if (sessions === null) {
		await db
			.update(cloudWorkspaceSessions)
			.set({
				stoppedAt: sql`${cloudWorkspaceSessions.startedAt} + make_interval(secs => ${cloudWorkspaceSessions.observedMs} / 1000.0)`,
			})
			.where(
				and(
					eq(cloudWorkspaceSessions.cloudWorkspaceId, workspace.id),
					isNull(cloudWorkspaceSessions.stoppedAt),
				),
			);
		return;
	}
	if (sessions.length === 0) return;
	const now = Date.now();
	const observed = sql`greatest(${cloudWorkspaceSessions.observedMs}, excluded.observed_ms)`;
	await db
		.insert(cloudWorkspaceSessions)
		.values(
			sessions.map((session) => {
				const ms = observedMs(session, now);
				const settled = !autumn || (firstSight && session.endedAt !== null);
				return {
					id: session.id,
					cloudWorkspaceId: workspace.id,
					vcpus: session.vcpus,
					startedAt: new Date(session.startedAt),
					stoppedAt:
						session.endedAt === null ? null : new Date(session.endedAt),
					observedMs: ms,
					reportedMs: settled ? ms : 0,
				};
			}),
		)
		.onConflictDoUpdate({
			target: cloudWorkspaceSessions.id,
			set: {
				stoppedAt: sql`excluded.stopped_at`,
				observedMs: observed,
				...(autumn ? {} : { reportedMs: observed }),
				updatedAt: new Date(),
			},
		});
}

async function reportSession(args: {
	row: SessionRow;
	organizationId: string;
	createdByUserId: string | null;
}): Promise<number> {
	const { row } = args;
	if (!autumn) return 0;
	let to = row.inflightToMs;
	if (to === null) {
		if (unreportedMs(row) === 0) return 0;
		const claimed = await db
			.update(cloudWorkspaceSessions)
			.set({ inflightToMs: row.observedMs })
			.where(
				and(
					eq(cloudWorkspaceSessions.id, row.id),
					eq(cloudWorkspaceSessions.reportedMs, row.reportedMs),
					isNull(cloudWorkspaceSessions.inflightToMs),
				),
			)
			.returning({ id: cloudWorkspaceSessions.id });
		if (claimed.length === 0) return 0;
		to = row.observedMs;
	}
	const delta = to - row.reportedMs;
	await autumn.batchTrack([
		{
			customerId: args.organizationId,
			featureId: BOX_MINUTES_FEATURE_ID,
			value: boxMinutes(delta, row.vcpus),
			idempotencyKey: `${row.id}:${row.reportedMs}-${to}`,
			properties: {
				cloudWorkspaceId: row.cloudWorkspaceId,
				sessionId: row.id,
				userId: args.createdByUserId,
				vcpus: row.vcpus,
				wallMs: delta,
			},
		},
	]);
	await db
		.update(cloudWorkspaceSessions)
		.set({ reportedMs: to, inflightToMs: null })
		.where(
			and(
				eq(cloudWorkspaceSessions.id, row.id),
				eq(cloudWorkspaceSessions.inflightToMs, to),
			),
		);
	return delta;
}

export async function meterCloudWorkspace(
	cloudWorkspaceId: string,
): Promise<{ reportedMs: number }> {
	const [workspace] = await db
		.select({
			provider: cloudWorkspaces.provider,
			providerSandboxId: cloudWorkspaces.providerSandboxId,
			organizationId: cloudWorkspaces.organizationId,
			organizationName: organizations.name,
			createdByUserId: cloudWorkspaces.createdByUserId,
			createdAt: cloudWorkspaces.createdAt,
		})
		.from(cloudWorkspaces)
		.innerJoin(
			organizations,
			eq(organizations.id, cloudWorkspaces.organizationId),
		)
		.where(eq(cloudWorkspaces.id, cloudWorkspaceId));
	if (!workspace || workspace.provider !== "vercel") return { reportedMs: 0 };

	await recordSessions({
		id: cloudWorkspaceId,
		providerSandboxId: workspace.providerSandboxId,
		createdAt: workspace.createdAt,
	});
	if (!autumn) return { reportedMs: 0 };

	const unsettled = await db
		.select()
		.from(cloudWorkspaceSessions)
		.where(
			and(
				eq(cloudWorkspaceSessions.cloudWorkspaceId, cloudWorkspaceId),
				lt(
					cloudWorkspaceSessions.reportedMs,
					cloudWorkspaceSessions.observedMs,
				),
			),
		);
	if (
		!unsettled.some((row) => row.inflightToMs !== null || unreportedMs(row) > 0)
	) {
		return { reportedMs: 0 };
	}

	await autumn.customers.getOrCreate({
		customerId: workspace.organizationId,
		name: workspace.organizationName,
	});
	let reportedMs = 0;
	const failures: unknown[] = [];
	for (const row of unsettled) {
		try {
			reportedMs += await reportSession({
				row,
				organizationId: workspace.organizationId,
				createdByUserId: workspace.createdByUserId,
			});
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length > 0) {
		throw new AggregateError(
			failures,
			`[cloud-workspace] ${cloudWorkspaceId} usage report failed`,
		);
	}
	return { reportedMs };
}

export async function queueMeterCloudWorkspace(
	cloudWorkspaceId: string,
): Promise<void> {
	await publishCloudWorkspaceJob({
		path: "/api/cloud-workspaces/meter",
		body: { cloudWorkspaceId },
		runLocally: (body) => meterCloudWorkspace(body.cloudWorkspaceId),
	}).catch((error) => {
		console.error(
			`[cloud-workspace] could not queue the meter for ${cloudWorkspaceId}`,
			error,
		);
	});
}

export async function reconcileCloudWorkspaceUsage(): Promise<{
	metered: number;
	failed: number;
}> {
	const names = await listActiveWorkspaceSandboxes(
		Date.now() - RECONCILE_LOOKBACK_MS,
	);
	const [running, unsettled] = await Promise.all([
		names.length === 0
			? []
			: db
					.select({ id: cloudWorkspaces.id })
					.from(cloudWorkspaces)
					.where(
						and(
							eq(cloudWorkspaces.provider, "vercel"),
							inArray(cloudWorkspaces.providerSandboxId, names),
						),
					),
		db
			.selectDistinct({ id: cloudWorkspaceSessions.cloudWorkspaceId })
			.from(cloudWorkspaceSessions)
			.where(
				autumn
					? or(
							isNull(cloudWorkspaceSessions.stoppedAt),
							lt(
								cloudWorkspaceSessions.reportedMs,
								cloudWorkspaceSessions.observedMs,
							),
						)
					: isNull(cloudWorkspaceSessions.stoppedAt),
			),
	]);
	const ids = [...new Set([...running, ...unsettled].map((row) => row.id))];

	let failed = 0;
	for (let i = 0; i < ids.length; i += RECONCILE_CONCURRENCY) {
		const results = await Promise.allSettled(
			ids.slice(i, i + RECONCILE_CONCURRENCY).map(meterCloudWorkspace),
		);
		for (const result of results) {
			if (result.status === "rejected") {
				failed += 1;
				console.error(
					"[cloud-workspace] reconcile meter failed",
					result.reason,
				);
			}
		}
	}
	return { metered: ids.length - failed, failed };
}
