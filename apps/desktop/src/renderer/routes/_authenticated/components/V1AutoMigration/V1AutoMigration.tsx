import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { posthog } from "renderer/lib/posthog";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { runV1Migration } from "renderer/lib/v1-migration";
import {
	isV1FollowUpPending,
	isV1ForcedFlipActive,
	isV1MigrationComplete,
	markV1MigrationComplete,
	setV1FollowUpPending,
} from "renderer/lib/v1-migration/completion";
import { v1MigrationEventProps } from "renderer/lib/v1-migration/telemetry";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { appendPendingMigratedTerminals } from "renderer/stores/workspace-creates/appendPendingMigratedTerminals";

/**
 * Headless v1→v2 auto-migration (migrate-then-flip). On the v1 surface it
 * runs one pass per boot once the preconditions hold, records everything in
 * the ledger, and marks the org complete when the flip gate (projects +
 * workspaces) is satisfied — the NEXT launch then lands on v2 with data
 * already in place. On the v2 surface it keeps running only while there is
 * outstanding work: best-effort kinds (settings/presets/terminals) that
 * were still failing when the gate completed (D4), or everything on
 * machines the forced-flip backstop moved before their gate completed.
 * Cross-instance single-flight via a main-process lock file; failures retry
 * next boot.
 */
export function V1AutoMigration() {
	const { data: session } = authClient.useSession();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { activeHostUrl } = useLocalHostService();
	const collections = useCollections();
	const finalizeSetup = useFinalizeProjectSetup();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const agentsQuery = useV2AgentConfigs(activeHostUrl);
	// Rollout pacing: percentage ramp + high-profile org exclusions. Only
	// gates NEW migrations (v1 surface) — post-flip catch-up must always run.
	// undefined (flags not loaded / offline) counts as off: stay on v1.
	const migrationFlagEnabled = useFeatureFlagEnabled(
		FEATURE_FLAGS.V1_AUTO_MIGRATION,
	);
	const startedOrgsRef = useRef<Set<string>>(new Set());

	const organizationId = session?.session?.activeOrganizationId ?? null;
	const onboarded = !!session?.user?.onboardedAt;
	// Preset import resolves against agent configs, so wait for the query to
	// settle — a pass racing ahead with a still-loading empty list would
	// import presets without their agent links and ledger them as done.
	const agentsSettled = agentsQuery.isFetched;
	const agents = agentsQuery.data ?? [];

	useEffect(() => {
		if (!organizationId || !onboarded || !activeHostUrl || !agentsSettled) {
			return;
		}
		if (isV2CloudEnabled) {
			const followUp =
				isV1FollowUpPending(organizationId) ||
				(isV1ForcedFlipActive() && !isV1MigrationComplete(organizationId));
			if (!followUp) return;
		} else if (migrationFlagEnabled !== true) {
			return;
		}
		if (startedOrgsRef.current.has(organizationId)) return;
		startedOrgsRef.current.add(organizationId);

		const hostUrl = activeHostUrl;
		const trigger = isV2CloudEnabled ? "v2-followup" : "v1-surface";
		void (async () => {
			let locked = false;
			const startedAt = Date.now();
			try {
				const lock = await electronTrpcClient.migration.acquireRunLock.mutate();
				if (!lock.acquired) return;
				locked = true;

				const summary = await runV1Migration({
					organizationId,
					hostClient: getHostServiceClientByUrl(hostUrl),
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
							mainWorkspaceId: result.mainWorkspaceId,
						});
					},
					onWorkspaceAdopted: (v2WorkspaceId, v2ProjectId) => {
						ensureWorkspaceInSidebar(v2WorkspaceId, v2ProjectId);
					},
				});

				console.log("[v1-migration] auto pass finished", summary);
				let firstCompletion = false;
				if (summary.gateComplete) {
					firstCompletion = !isV1MigrationComplete(organizationId);
					markV1MigrationComplete(organizationId);
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
						firstCompletion || !bestEffortClean,
					);
				}

				// Failure reasons come from the ledger (the summary only counts)
				// so the stuck cohort is identifiable, not just sized.
				let failureReasons: string[] = [];
				if (summary.projects.failed + summary.workspaces.failed > 0) {
					try {
						const rows = await electronTrpcClient.migration.ledgerList.query({
							organizationId,
						});
						failureReasons = [
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
						].slice(0, 5);
					} catch {}
				}
				posthog.capture("v1_auto_migration_completed", {
					...v1MigrationEventProps(summary),
					trigger,
					first_completion: firstCompletion,
					duration_ms: Date.now() - startedAt,
					failure_reasons: failureReasons,
				});
			} catch (err) {
				// Retries next boot; the ledger holds whatever progress landed.
				console.error("[v1-migration] auto pass failed", err);
				posthog.capture("v1_auto_migration_failed", {
					trigger,
					duration_ms: Date.now() - startedAt,
					error: err instanceof Error ? err.message : String(err),
				});
			} finally {
				if (locked) {
					void electronTrpcClient.migration.releaseRunLock
						.mutate()
						.catch(() => {});
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
	]);

	return null;
}
