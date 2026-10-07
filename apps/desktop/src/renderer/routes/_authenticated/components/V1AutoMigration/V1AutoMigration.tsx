import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useRef, useState } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { posthog } from "renderer/lib/posthog";
import { runV1Migration } from "renderer/lib/v1-migration";
import { listV1AttentionItems } from "renderer/lib/v1-migration/attention";
import {
	isV1FollowUpPending,
	isV1MigrationComplete,
	markV1MigrationComplete,
	setV1FollowUpPending,
} from "renderer/lib/v1-migration/completion";
import {
	migrateV1Groups,
	type V1GroupTarget,
} from "renderer/lib/v1-migration/groups";
import {
	electronV1MigrationIpc,
	type V1MigrationIpc,
} from "renderer/lib/v1-migration/ipc";
import { scopeV1MigrationIpc } from "renderer/lib/v1-migration/ownership";
import { planV1AutoPass } from "renderer/lib/v1-migration/pass";
import {
	isTransientV1MigrationFailure,
	nextV1MigrationRetryDelayMs,
} from "renderer/lib/v1-migration/retry";
import {
	electronV1MigrationRunLock,
	waitForV1MigrationRunLock,
} from "renderer/lib/v1-migration/run-lock";
import { v1MigrationEventProps } from "renderer/lib/v1-migration/telemetry";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { buildSidebarFolderKey } from "renderer/routes/_authenticated/utils/workspaceTagFolders/workspaceTagFolders";
import { useV1MigrationStatusStore } from "renderer/stores/v1-migration-status";
import { appendPendingMigratedTerminals } from "renderer/stores/workspace-creates/appendPendingMigratedTerminals";

/**
 * Headless v1→v2 auto-migration (migrate-then-flip). On the v1 surface it
 * runs one pass per boot once the preconditions hold, records everything in
 * the ledger, and marks the org complete when the flip gate (projects +
 * workspaces) is satisfied — the NEXT launch then lands on v2 with data
 * already in place. On the v2 surface the full pass runs while there is
 * outstanding work: best-effort kinds (settings/presets/terminals) that
 * were still failing when the gate completed (D4), or everything on
 * machines that reached v2 with unmigrated v1 data (see planV2SurfacePass).
 * Completed v2 migrations still run the ledger-guarded group backfill, since
 * older passes omitted groups entirely.
 * Cross-instance single-flight via a main-process lock file. A pass that
 * throws, or leaves the gate open only for transient reasons (network,
 * host-service down), re-arms itself on a short backoff within the session;
 * anything else waits for the next boot.
 */
async function listGatingFailureReasons(
	ipc: V1MigrationIpc,
	organizationId: string,
): Promise<string[]> {
	const rows = await ipc.ledgerList(organizationId);
	return [
		...new Set(
			rows
				.filter(
					(r) =>
						r.status === "error" &&
						(r.kind === "project" || r.kind === "workspace"),
				)
				.map((r) => r.reason)
				.filter((r): r is string => !!r),
		),
	];
}

export function V1AutoMigration() {
	const { data: session } = authClient.useSession();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { activeHostUrl } = useLocalHostService();
	const collections = useCollections();
	const finalizeSetup = useFinalizeProjectSetup();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const agentsQuery = useV2AgentConfigs(activeHostUrl);
	const setMigrationStatus = useV1MigrationStatusStore((s) => s.setStatus);
	// Rollout pacing: percentage ramp + high-profile org exclusions. Only
	// gates NEW migrations (v1 surface) — post-flip catch-up must always run.
	// undefined (flags not loaded / offline) counts as off: stay on v1.
	const migrationFlagEnabled = useFeatureFlagEnabled(
		FEATURE_FLAGS.V1_AUTO_MIGRATION,
	);
	const startedOrgsRef = useRef<Set<string>>(new Set());
	const retryAttemptsRef = useRef<Map<string, number>>(new Map());
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const activeOrgRef = useRef<string | null>(null);
	const [retryTick, setRetryTick] = useState(0);

	const organizationId = session?.session?.activeOrganizationId ?? null;
	const onboarded = !!session?.user?.onboardedAt;
	// Preset import resolves against agent configs, so wait for the query to
	// settle — a pass racing ahead with a still-loading empty list would
	// import presets without their agent links and ledger them as done.
	const agentsSettled = agentsQuery.isFetched;
	const agents = agentsQuery.data ?? [];

	useEffect(() => {
		activeOrgRef.current = organizationId;
		return () => {
			activeOrgRef.current = null;
			if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		};
	}, [organizationId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: retryTick re-runs the pass after a scheduled retry
	useEffect(() => {
		if (!organizationId || !onboarded || !activeHostUrl || !agentsSettled) {
			return;
		}
		if (!isV2CloudEnabled && migrationFlagEnabled !== true) return;
		if (startedOrgsRef.current.has(organizationId)) return;
		startedOrgsRef.current.add(organizationId);

		const hostUrl = activeHostUrl;
		const trigger = isV2CloudEnabled ? "v2-followup" : "v1-surface";
		const isActiveOrg = () => activeOrgRef.current === organizationId;
		const setStatus: typeof setMigrationStatus = (...args) => {
			if (isActiveOrg()) setMigrationStatus(...args);
		};
		let ipc: V1MigrationIpc = electronV1MigrationIpc;
		const settleStatus = async (blocked: boolean) => {
			if (blocked) {
				setStatus(organizationId, "blocked");
				return;
			}
			const [ledgerRows, v1Projects, v1Workspaces, v1Worktrees] =
				await Promise.all([
					ipc.ledgerList(organizationId),
					ipc.readV1Projects(),
					ipc.readV1Workspaces(),
					ipc.readV1Worktrees(),
				]).catch(() => [null, [], [], []] as const);
			if (!ledgerRows) return;
			const items = listV1AttentionItems({
				ledgerRows,
				v1Projects,
				v1Workspaces,
				v1Worktrees,
			});
			setStatus(organizationId, items.length > 0 ? "attention" : "idle", items);
		};
		const scheduleRetry = (reasons: string[]): boolean => {
			if (retryTimerRef.current || !isActiveOrg()) {
				return true;
			}
			const attempt = (retryAttemptsRef.current.get(organizationId) ?? 0) + 1;
			const delayMs = nextV1MigrationRetryDelayMs(attempt);
			if (delayMs === null) return false;
			retryAttemptsRef.current.set(organizationId, attempt);
			posthog.capture("v1_auto_migration_retry_scheduled", {
				trigger,
				attempt,
				delay_ms: delayMs,
				reasons: reasons.slice(0, 5),
			});
			retryTimerRef.current = setTimeout(() => {
				retryTimerRef.current = null;
				startedOrgsRef.current.delete(organizationId);
				setRetryTick((tick) => tick + 1);
			}, delayMs);
			return true;
		};
		void (async () => {
			let lockToken: string | null = null;
			let showsProgress = false;
			const startedAt = Date.now();
			try {
				lockToken = await waitForV1MigrationRunLock({
					shouldStop: () => !isActiveOrg(),
				});
				if (lockToken === null) {
					// Org switched while waiting: run again if the user comes back.
					startedOrgsRef.current.delete(organizationId);
					return;
				}
				const scoped = await scopeV1MigrationIpc(
					electronV1MigrationIpc,
					organizationId,
				);
				ipc = scoped.ipc;

				let groupsOnly = false;
				if (isV2CloudEnabled) {
					const plan = await planV1AutoPass({
						ipc,
						leftOut: scoped.leftOut,
						organizationId,
						followUpPending: isV1FollowUpPending(organizationId),
						migrationComplete: isV1MigrationComplete(organizationId),
					});
					groupsOnly = plan.pass === "groups-only";
					showsProgress = plan.showsProgress;
				}
				if (showsProgress) setStatus(organizationId, "running");

				const groupTarget: V1GroupTarget = (group, projectId, tag) => {
					const sectionId = buildSidebarFolderKey(projectId, tag);
					if (collections.v2SidebarSections.get(sectionId)) return;
					collections.v2SidebarSections.insert({
						sectionId,
						projectId,
						tag,
						name: group.name.trim() || tag,
						color: group.color,
						tabOrder: group.tabOrder,
						isCollapsed: group.isCollapsed ?? false,
						createdAt: new Date(group.createdAt ?? Date.now()),
					});
				};
				// Older completed migrations never imported v1 groups. Backfill on
				// v2 boots too; the ledger preserves later v2 customizations.
				if (groupsOnly) {
					await migrateV1Groups({
						groupTarget,
						organizationId,
						hostClient: getHostServiceClientByUrl(hostUrl),
						ipc,
					});
					return;
				}

				const summary = await runV1Migration({
					groupTarget,
					organizationId,
					hostClient: getHostServiceClientByUrl(hostUrl),
					ipc,
					reconcileWithHost: !isV2CloudEnabled,
					presetTarget: {
						agents,
						existing: Array.from(
							collections.v2TerminalPresets.state.values(),
						).map((p) => ({ name: p.name, agentId: p.agentId })),
						insert: (row) => collections.v2TerminalPresets.insert(row),
					},
					terminalTarget: {
						appendPending: (workspace, terminals) =>
							appendPendingMigratedTerminals(collections, workspace, terminals),
					},
					onProjectImported: (result) => {
						finalizeSetup(hostUrl, {
							projectId: result.v2ProjectId,
							repoPath: result.repoPath,
						});
					},
					onWorkspaceAdopted: (v2WorkspaceId, v2ProjectId) => {
						ensureWorkspaceInSidebar(v2WorkspaceId, v2ProjectId);
					},
				});

				console.log("[v1-migration] auto pass finished", summary);
				if (!summary.gateComplete) {
					let gatingReasons: string[] = [];
					try {
						gatingReasons = await listGatingFailureReasons(ipc, organizationId);
					} catch {}
					const retrying =
						gatingReasons.length > 0 &&
						gatingReasons.every(isTransientV1MigrationFailure) &&
						scheduleRetry(gatingReasons);
					if (!retrying) await settleStatus(true);
				} else {
					await settleStatus(false);
				}

				let firstCompletion = false;
				if (summary.gateComplete) {
					firstCompletion = !isV1MigrationComplete(organizationId);
					// Already on v2: no flip happens, so no welcome card or
					// continuity restore to hand off to the next launch.
					markV1MigrationComplete(organizationId, {
						armFlipHandoff: !isV2CloudEnabled,
					});
					const bestEffortClean =
						summary.settings.failed +
							summary.settings.deferred +
							summary.presets.failed +
							summary.presets.deferred +
							summary.terminals.failed +
							summary.terminals.deferred ===
						0;
					// First completion always arms a catch-up pass: the user keeps
					// working on v1 for the REST of this session (the pass ran at
					// boot), so the first v2 boot must re-sync that tail before the
					// flag can clear.
					setV1FollowUpPending(
						organizationId,
						(firstCompletion && !isV2CloudEnabled) || !bestEffortClean,
					);
				}

				// Failure and skip reasons come from the ledger (the summary only
				// counts) so the stuck cohort is identifiable, not just sized.
				let failureReasons: string[] = [];
				let skipReasons: string[] = [];
				const gating = (r: { kind: string }) =>
					r.kind === "project" || r.kind === "workspace";
				if (
					summary.projects.failed +
						summary.workspaces.failed +
						summary.projects.skipped +
						summary.workspaces.skipped >
					0
				) {
					try {
						const rows = await ipc.ledgerList(organizationId);
						const reasons = (status: "error" | "skipped") =>
							[
								...new Set(
									rows
										.filter((r) => r.status === status && gating(r))
										.map((r) => r.reason)
										.filter((r): r is string => !!r),
								),
							].slice(0, 5);
						failureReasons = reasons("error");
						skipReasons = reasons("skipped");
					} catch {}
				}
				posthog.capture("v1_auto_migration_completed", {
					...v1MigrationEventProps(summary),
					trigger,
					first_completion: firstCompletion,
					duration_ms: Date.now() - startedAt,
					failure_reasons: failureReasons,
					skip_reasons: skipReasons,
				});
			} catch (err) {
				// Retries next boot; the ledger holds whatever progress landed.
				console.error("[v1-migration] auto pass failed", err);
				posthog.capture("v1_auto_migration_failed", {
					trigger,
					duration_ms: Date.now() - startedAt,
					error: err instanceof Error ? err.message : String(err),
				});
				const retrying = scheduleRetry([
					err instanceof Error ? err.message : String(err),
				]);
				if (showsProgress && !retrying) {
					setStatus(organizationId, "blocked");
				}
			} finally {
				if (lockToken !== null) {
					void electronV1MigrationRunLock.release(lockToken).catch(() => {});
				}
			}
		})();
	}, [
		organizationId,
		onboarded,
		activeHostUrl,
		isV2CloudEnabled,
		migrationFlagEnabled,
		agentsSettled,
		agents,
		collections,
		finalizeSetup,
		ensureWorkspaceInSidebar,
		setMigrationStatus,
		retryTick,
	]);

	return null;
}
