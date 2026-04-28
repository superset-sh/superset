import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { env } from "renderer/env.renderer";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import { type MigrationSummary, migrateV1DataToV2 } from "./migrate";

export type MigrationRunResult =
	| { completed: true; summary: MigrationSummary }
	| { completed: false; reason: string };

function getAttemptKey(organizationId: string): string {
	return `v1-migration-attempted-${organizationId}`;
}

function getSummaryKey(organizationId: string): string {
	return `v1-migration-summary-${organizationId}`;
}

function getShownKey(organizationId: string): string {
	return `v1-migration-modal-shown-${organizationId}`;
}

export const V1_MIGRATION_SUMMARY_EVENT = "v1-migration-summary-updated";

function persistSummary(organizationId: string, summary: MigrationSummary) {
	localStorage.setItem(
		getSummaryKey(organizationId),
		JSON.stringify({ summary, createdAt: Date.now() }),
	);
	localStorage.setItem(getShownKey(organizationId), "1");
	window.dispatchEvent(
		new CustomEvent(V1_MIGRATION_SUMMARY_EVENT, { detail: { organizationId } }),
	);
}

// Module-level singleton so every hook instance shares the same isRunning value.
// Without this, the auto-run from the dashboard layout and the manual rerun
// from settings each have their own isRunning ref, letting the user start a
// concurrent migration from settings while the auto-run is still in flight.
let activeMigrationCount = 0;
const migrationRunningSubscribers = new Set<() => void>();

function subscribeMigrationRunning(notify: () => void) {
	migrationRunningSubscribers.add(notify);
	return () => {
		migrationRunningSubscribers.delete(notify);
	};
}

function getMigrationRunningSnapshot() {
	return activeMigrationCount > 0;
}

function setMigrationRunning(running: boolean) {
	activeMigrationCount = Math.max(0, activeMigrationCount + (running ? 1 : -1));
	for (const notify of migrationRunningSubscribers) notify();
}

/**
 * Fires v1→v2 migration once per app launch when the dashboard first mounts
 * with v2 enabled. Idempotent by design:
 * - sessionStorage marker dedups within a session (blocks strict-mode double-invoke)
 * - migration_state in the local DB tracks completed rows; subsequent runs
 *   reconcile success/linked project rows, skip completed workspace rows, and
 *   retry error rows plus parent-dependent workspace skips
 *
 * Reruns happen implicitly on app relaunch. No automatic retry timer or online
 * listener — v2 requires the cloud to be reachable anyway, so a transient
 * offline error resolves on the next launch.
 */
export function useMigrateV1DataToV2({
	autoRun = true,
}: {
	autoRun?: boolean;
} = {}) {
	const { data: session } = authClient.useSession();
	const { activeHostUrl } = useLocalHostService();
	const { isV2CloudEnabled } = useIsV2CloudEnabled();
	const collections = useCollections();
	const isRunning = useSyncExternalStore(
		subscribeMigrationRunning,
		getMigrationRunningSnapshot,
		getMigrationRunningSnapshot,
	);
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const attemptedRef = useRef<string | null>(null);

	const runMigration = useCallback(
		async ({ manual }: { manual: boolean }): Promise<MigrationRunResult> => {
			if (!isV2CloudEnabled) {
				return { completed: false, reason: "Superset v2 is not enabled" };
			}
			if (!organizationId) {
				return { completed: false, reason: "No active organization" };
			}
			if (!activeHostUrl) {
				return { completed: false, reason: "Host service is not ready" };
			}
			if (activeMigrationCount > 0) {
				return { completed: false, reason: "Migration is already running" };
			}

			const attemptKey = getAttemptKey(organizationId);
			if (!manual) {
				if (attemptedRef.current === organizationId) {
					return {
						completed: false,
						reason: "Migration already ran in this session",
					};
				}
				if (sessionStorage.getItem(attemptKey) === "1") {
					attemptedRef.current = organizationId;
					return {
						completed: false,
						reason: "Migration already ran in this session",
					};
				}
			}

			attemptedRef.current = organizationId;
			sessionStorage.setItem(attemptKey, "1");
			setMigrationRunning(true);

			try {
				const hostService = getHostServiceClientByUrl(activeHostUrl);
				const summary = await migrateV1DataToV2({
					organizationId,
					electronTrpc: electronTrpcClient,
					hostService,
					collections,
				});

				// Persist summary unconditionally before any early-return paths — it's
				// an idempotent side effect and must survive strict-mode effect
				// teardowns that can happen between migration completion and here.
				const didAnything =
					summary.projectsCreated +
						summary.projectsLinked +
						summary.projectsErrored +
						summary.workspacesCreated +
						summary.workspacesSkipped +
						summary.workspacesErrored >
					0;
				const alreadyShown =
					localStorage.getItem(getShownKey(organizationId)) === "1";
				if (manual || (didAnything && !alreadyShown)) {
					persistSummary(organizationId, summary);
				}

				if (summary.errors.length > 0) {
					console.error("[v1-migration] errors", summary.errors);
				}
				return { completed: true, summary };
			} catch (err) {
				// Clear marker so a relaunch can retry (e.g., transient cloud unreach
				// before session fully hydrated).
				sessionStorage.removeItem(attemptKey);
				attemptedRef.current = null;
				console.error("[v1-migration] fatal", err);
				const reason = err instanceof Error ? err.message : String(err);
				return { completed: false, reason };
			} finally {
				setMigrationRunning(false);
			}
		},
		[activeHostUrl, collections, isV2CloudEnabled, organizationId],
	);

	useEffect(() => {
		if (!autoRun) return;
		void runMigration({ manual: false });
	}, [autoRun, runMigration]);

	const rerun = useCallback(async (): Promise<MigrationRunResult> => {
		if (!organizationId) {
			return { completed: false, reason: "No active organization" };
		}
		sessionStorage.removeItem(getAttemptKey(organizationId));
		attemptedRef.current = null;
		return runMigration({ manual: true });
	}, [organizationId, runMigration]);

	return { rerun, isRunning };
}
