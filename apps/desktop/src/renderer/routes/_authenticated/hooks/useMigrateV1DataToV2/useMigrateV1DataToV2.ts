import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import { type MigrationSummary, migrateV1DataToV2 } from "./migrate";

function getAttemptKey(organizationId: string): string {
	return `v1-migration-attempted-${organizationId}`;
}

function getSummaryKey(organizationId: string): string {
	return `v1-migration-summary-${organizationId}`;
}

export const V1_MIGRATION_SUMMARY_EVENT = "v1-migration-summary-updated";

function persistSummary(organizationId: string, summary: MigrationSummary) {
	localStorage.setItem(
		getSummaryKey(organizationId),
		JSON.stringify({ summary, createdAt: Date.now() }),
	);
	window.dispatchEvent(
		new CustomEvent(V1_MIGRATION_SUMMARY_EVENT, { detail: { organizationId } }),
	);
}

/**
 * Fires v1→v2 migration once per app launch when the dashboard first mounts
 * with v2 enabled. Idempotent by design:
 * - sessionStorage marker dedups within a session (blocks strict-mode double-invoke)
 * - migration_state in the local DB tracks completed rows; subsequent runs
 *   skip rows already recorded as success/linked/skipped and retry error rows
 *
 * Reruns happen implicitly on app relaunch. No automatic retry timer or online
 * listener — v2 requires the cloud to be reachable anyway, so a transient
 * offline error resolves on the next launch.
 */
export function useMigrateV1DataToV2() {
	const { data: session } = authClient.useSession();
	const { activeHostUrl } = useLocalHostService();
	const { isV2CloudEnabled } = useIsV2CloudEnabled();
	const collections = useCollections();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const attemptedRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isV2CloudEnabled) return;
		if (!organizationId || !activeHostUrl) return;
		if (attemptedRef.current === organizationId) return;

		const attemptKey = getAttemptKey(organizationId);
		if (sessionStorage.getItem(attemptKey) === "1") {
			attemptedRef.current = organizationId;
			return;
		}

		attemptedRef.current = organizationId;
		sessionStorage.setItem(attemptKey, "1");

		void (async () => {
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
						summary.workspacesCreated >
					0;
				if (didAnything) {
					persistSummary(organizationId, summary);
				}

				if (summary.errors.length > 0) {
					console.error("[v1-migration] errors", summary.errors);
				}
			} catch (err) {
				// Clear marker so a relaunch can retry (e.g., transient cloud unreach
				// before session fully hydrated).
				sessionStorage.removeItem(attemptKey);
				attemptedRef.current = null;
				console.error("[v1-migration] fatal", err);
			}
		})();
	}, [isV2CloudEnabled, organizationId, activeHostUrl, collections]);
}
