import { useEffect, useRef } from "react";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { runV1Migration } from "renderer/lib/v1-migration";
import { markV1MigrationComplete } from "renderer/lib/v1-migration/completion";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { appendPendingMigratedTerminals } from "renderer/stores/workspace-creates/appendPendingMigratedTerminals";

/**
 * Headless v1→v2 auto-migration (migrate-then-flip). Mounted only while the
 * user is still on the v1 surface; runs one migration pass per boot once the
 * preconditions hold, records everything in the ledger, and marks the org
 * complete when the flip gate (projects + workspaces) is satisfied — the
 * NEXT launch then lands on v2 with data already in place. Cross-instance
 * single-flight via a main-process lock file; failures retry next boot.
 */
export function V1AutoMigration() {
	const { data: session } = authClient.useSession();
	const { activeHostUrl } = useLocalHostService();
	const collections = useCollections();
	const finalizeSetup = useFinalizeProjectSetup();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const { data: agents = [] } = useV2AgentConfigs(activeHostUrl);
	const _agentsReady = agents.length > 0;
	const startedForOrgRef = useRef<string | null>(null);

	const organizationId = session?.session?.activeOrganizationId ?? null;
	const onboarded = !!session?.user?.onboardedAt;

	useEffect(() => {
		if (!organizationId || !onboarded || !activeHostUrl) return;
		if (startedForOrgRef.current === organizationId) return;
		startedForOrgRef.current = organizationId;

		const hostUrl = activeHostUrl;
		void (async () => {
			let locked = false;
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
				if (summary.gateComplete) {
					markV1MigrationComplete(organizationId);
				}
			} catch (err) {
				// Retries next boot; the ledger holds whatever progress landed.
				console.error("[v1-migration] auto pass failed", err);
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
		agents,
		collections,
		finalizeSetup,
		ensureWorkspaceInSidebar,
	]);

	return null;
}
