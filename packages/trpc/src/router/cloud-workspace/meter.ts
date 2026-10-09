import { db } from "@superset/db/client";
import {
	cloudWorkspaceSessions,
	cloudWorkspaces,
	organizations,
} from "@superset/db/schema";
import { and, eq, inArray, isNull, lt, max, or, sql } from "drizzle-orm";
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

async function recordSessions(
	cloudWorkspaceId: string,
	providerSandboxId: string,
): Promise<void> {
	const [latest] = await db
		.select({ stoppedAt: max(cloudWorkspaceSessions.stoppedAt) })
		.from(cloudWorkspaceSessions)
		.where(eq(cloudWorkspaceSessions.cloudWorkspaceId, cloudWorkspaceId));
	const now = Date.now();
	const sessions = await listSandboxSessions(
		providerSandboxId,
		latest?.stoppedAt?.getTime() ?? now,
	);
	if (sessions.length === 0) return;
	const observed = sql`greatest(${cloudWorkspaceSessions.observedMs}, excluded.observed_ms)`;
	await db
		.insert(cloudWorkspaceSessions)
		.values(
			sessions.map((session) => ({
				id: session.id,
				cloudWorkspaceId,
				vcpus: session.vcpus,
				startedAt: new Date(session.startedAt),
				stoppedAt: session.endedAt === null ? null : new Date(session.endedAt),
				observedMs: observedMs(session, now),
				reportedMs: autumn ? 0 : observedMs(session, now),
			})),
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
	const delta = unreportedMs(row);
	if (!autumn || delta === 0) return 0;
	const claimed = await db
		.update(cloudWorkspaceSessions)
		.set({ reportedMs: row.observedMs })
		.where(
			and(
				eq(cloudWorkspaceSessions.id, row.id),
				eq(cloudWorkspaceSessions.reportedMs, row.reportedMs),
			),
		)
		.returning({ id: cloudWorkspaceSessions.id });
	if (claimed.length === 0) return 0;
	try {
		await autumn.track(
			{
				customerId: args.organizationId,
				featureId: BOX_MINUTES_FEATURE_ID,
				value: boxMinutes(delta, row.vcpus),
				properties: {
					cloudWorkspaceId: row.cloudWorkspaceId,
					sessionId: row.id,
					userId: args.createdByUserId,
					vcpus: row.vcpus,
					wallMs: delta,
				},
			},
			{ headers: { "Idempotency-Key": `${row.id}:${row.observedMs}` } },
		);
	} catch (error) {
		await db
			.update(cloudWorkspaceSessions)
			.set({ reportedMs: row.reportedMs })
			.where(
				and(
					eq(cloudWorkspaceSessions.id, row.id),
					eq(cloudWorkspaceSessions.reportedMs, row.observedMs),
				),
			);
		throw error;
	}
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
		})
		.from(cloudWorkspaces)
		.innerJoin(
			organizations,
			eq(organizations.id, cloudWorkspaces.organizationId),
		)
		.where(eq(cloudWorkspaces.id, cloudWorkspaceId));
	if (!workspace || workspace.provider !== "vercel") return { reportedMs: 0 };

	await recordSessions(cloudWorkspaceId, workspace.providerSandboxId);
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
	if (!unsettled.some((row) => unreportedMs(row) > 0)) return { reportedMs: 0 };

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
