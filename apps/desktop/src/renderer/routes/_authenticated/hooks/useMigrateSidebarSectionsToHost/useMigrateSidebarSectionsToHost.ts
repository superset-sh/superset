import { useEffect, useRef } from "react";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const MIGRATION_FLAG_PREFIX = "v2-sections-host-migration-v1";

function migrationFlagKey(organizationId: string): string {
	return `${MIGRATION_FLAG_PREFIX}-${organizationId}`;
}

/**
 * One-time migration of legacy renderer-localStorage sidebar sections into
 * host-service. Id-preserving, best-effort for unreachable hosts; legacy
 * rows are left in place as rollback safety until a later release.
 */
export function useMigrateSidebarSectionsToHost(): void {
	const collections = useCollections();
	const {
		sections: hostSections,
		workspaces: hostWorkspaces,
		isReady,
		cache,
		sectionsCache,
	} = useHostWorkspaces();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	// Org this session already started migrating (not a bare boolean, so an org
	// switch without a remount still migrates the new one).
	const startedOrgRef = useRef<string | null>(null);

	useEffect(() => {
		if (!organizationId || !machineId || !activeHostUrl || !isReady) return;
		if (startedOrgRef.current === organizationId) return;
		const flagKey = migrationFlagKey(organizationId);
		if (localStorage.getItem(flagKey)) return;

		const legacySections = Array.from(
			collections.v2SidebarSections.state.values(),
		);
		if (legacySections.length === 0) {
			localStorage.setItem(flagKey, "empty");
			return;
		}

		// Skip only when EVERY legacy section already exists (another device
		// fully migrated). Partial overlap still runs the idempotent creates.
		const hostSectionIds = new Set(hostSections.map((section) => section.id));
		if (legacySections.every((row) => hostSectionIds.has(row.sectionId))) {
			localStorage.setItem(flagKey, "adopted");
			return;
		}

		startedOrgRef.current = organizationId;

		const legacyPlacements = Array.from(
			collections.v2WorkspaceLocalState.state.values(),
		)
			.filter((row) => row.sidebarState.isHidden !== true)
			.map((row) => ({
				workspaceId: row.workspaceId,
				sectionId: row.sidebarState.sectionId ?? null,
				tabOrder: row.sidebarState.tabOrder ?? 0,
			}));
		const hostByWorkspaceId = new Map(
			hostWorkspaces.map((workspace) => [workspace.id, workspace.hostId]),
		);

		const run = async () => {
			const localClient = getHostServiceClientByUrl(activeHostUrl);
			for (const section of legacySections) {
				await localClient.sections.create.mutate({
					id: section.sectionId,
					projectId: section.projectId,
					name: section.name,
					color: section.color,
					tabOrder: section.tabOrder,
				});
			}

			for (const section of legacySections) {
				if (!section.isCollapsed) continue;
				if (collections.v2SectionUiState.get(section.sectionId)) continue;
				collections.v2SectionUiState.insert({
					sectionId: section.sectionId,
					isCollapsed: true,
				});
			}

			let skipped = 0;
			for (const placement of legacyPlacements) {
				const hostId = hostByWorkspaceId.get(placement.workspaceId);
				if (!hostId) continue;
				const hostUrl = cache.resolveHostUrl(hostId);
				if (!hostUrl) {
					skipped += 1;
					continue;
				}
				await getHostServiceClientByUrl(hostUrl)
					.sections.moveWorkspace.mutate({
						workspaceId: placement.workspaceId,
						sectionId: placement.sectionId,
						tabOrder: placement.tabOrder,
					})
					.catch((error: unknown) => {
						skipped += 1;
						console.warn(
							"[sections-migration] placement write failed",
							placement.workspaceId,
							error,
						);
					});
			}

			// Only mark complete when every placement landed; otherwise leave the
			// flag unset to retry next launch (startedOrgRef blocks a re-run now).
			if (skipped === 0) {
				localStorage.setItem(flagKey, "migrated");
			} else {
				console.warn(
					`[sections-migration] ${skipped} workspace placements skipped (host unreachable); will retry next launch`,
				);
			}
			sectionsCache.invalidateHost(machineId);
			cache.invalidateHost(machineId);
		};

		run().catch((error: unknown) => {
			// No flag on failure — retried on next launch.
			startedOrgRef.current = null;
			console.error("[sections-migration] failed; will retry", error);
		});
	}, [
		activeHostUrl,
		cache,
		collections,
		hostSections,
		hostWorkspaces,
		isReady,
		machineId,
		organizationId,
		sectionsCache,
	]);
}
