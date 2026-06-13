import { mintUserJwt } from "@superset/auth/server";
import { dbWs } from "@superset/db/client";
import { automationRuns, automations, users } from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { eq } from "drizzle-orm";
import { relayMutation } from "./relay-client";

export interface AutomationRunWorkspaceCleanupTarget {
	runId: string;
	automationId: string;
	organizationId: string;
	ownerUserId: string;
	ownerEmail: string | null;
	hostId: string | null;
	workspaceId: string | null;
	automationWorkspaceId: string | null;
}

export type AutomationRunWorkspaceCleanupDecision =
	| { shouldCleanup: true }
	| { shouldCleanup: false; reason: string };

export interface AutomationRunWorkspaceCleanupResult {
	status: "cleaned" | "skipped" | "failed";
	reason?: string;
	warnings?: string[];
}

export function decideAutomationRunWorkspaceCleanup(
	target: AutomationRunWorkspaceCleanupTarget,
): AutomationRunWorkspaceCleanupDecision {
	if (!target.hostId) {
		return { shouldCleanup: false, reason: "run has no host" };
	}
	if (!target.workspaceId) {
		return { shouldCleanup: false, reason: "run has no workspace" };
	}
	if (target.automationWorkspaceId) {
		return {
			shouldCleanup: false,
			reason: "automation is configured to reuse a workspace",
		};
	}
	return { shouldCleanup: true };
}

export async function loadAutomationRunWorkspaceCleanupTarget(
	runId: string,
): Promise<AutomationRunWorkspaceCleanupTarget | null> {
	const [row] = await dbWs
		.select({
			runId: automationRuns.id,
			automationId: automationRuns.automationId,
			organizationId: automationRuns.organizationId,
			ownerUserId: automations.ownerUserId,
			ownerEmail: users.email,
			hostId: automationRuns.hostId,
			workspaceId: automationRuns.v2WorkspaceId,
			automationWorkspaceId: automations.v2WorkspaceId,
		})
		.from(automationRuns)
		.innerJoin(automations, eq(automations.id, automationRuns.automationId))
		.leftJoin(users, eq(users.id, automations.ownerUserId))
		.where(eq(automationRuns.id, runId))
		.limit(1);

	return row ?? null;
}

export async function cleanupAutomationRunWorkspace(args: {
	runId: string;
	relayUrl: string;
}): Promise<AutomationRunWorkspaceCleanupResult> {
	const target = await loadAutomationRunWorkspaceCleanupTarget(args.runId);
	if (!target) {
		return { status: "skipped", reason: "run not found" };
	}

	const decision = decideAutomationRunWorkspaceCleanup(target);
	if (!decision.shouldCleanup) {
		return { status: "skipped", reason: decision.reason };
	}
	const hostId = target.hostId;
	const workspaceId = target.workspaceId;
	if (!hostId || !workspaceId) {
		return { status: "skipped", reason: "run cleanup target is incomplete" };
	}

	const jwt = await mintUserJwt({
		userId: target.ownerUserId,
		email: target.ownerEmail ?? undefined,
		organizationIds: [target.organizationId],
		ttlSeconds: 10 * 60,
	});

	const result = await relayMutation<
		{
			workspaceId: string;
			deleteBranch: boolean;
			force: boolean;
			skipDirtyCheck: boolean;
		},
		{ success: boolean; warnings?: string[] }
	>(
		{
			relayUrl: args.relayUrl,
			hostId: buildHostRoutingKey(target.organizationId, hostId),
			jwt,
			timeoutMs: 120_000,
		},
		"workspaceCleanup.destroy",
		{
			workspaceId,
			deleteBranch: true,
			force: false,
			skipDirtyCheck: true,
		},
	);

	return {
		status: result.success ? "cleaned" : "failed",
		warnings: result.warnings,
	};
}

export function scheduleAutomationRunWorkspaceCleanup(args: {
	runId: string;
	relayUrl: string;
	reason: string;
	delayMs?: number;
}): void {
	const timer = setTimeout(() => {
		void cleanupAutomationRunWorkspace({
			runId: args.runId,
			relayUrl: args.relayUrl,
		})
			.then((result) => {
				if (result.status === "cleaned") {
					console.info("[automation-cleanup] cleaned run workspace", {
						runId: args.runId,
						reason: args.reason,
						warnings: result.warnings ?? [],
					});
					return;
				}
				if (result.status === "skipped") {
					console.info("[automation-cleanup] skipped run workspace cleanup", {
						runId: args.runId,
						reason: result.reason,
					});
					return;
				}
				console.warn("[automation-cleanup] workspace cleanup did not succeed", {
					runId: args.runId,
					reason: args.reason,
					result,
				});
			})
			.catch((error) => {
				console.warn("[automation-cleanup] failed to clean run workspace", {
					runId: args.runId,
					reason: args.reason,
					error: error instanceof Error ? error.message : String(error),
				});
			});
	}, args.delayMs ?? 2_000);
	timer.unref?.();
}
