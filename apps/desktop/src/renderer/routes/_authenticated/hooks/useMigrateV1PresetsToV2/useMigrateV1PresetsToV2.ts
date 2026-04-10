import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

/**
 * Org-scoped marker key. The v2TerminalPresets collection is per-org
 * (`v2-terminal-presets-${organizationId}`) so the migration marker must be
 * too — switching orgs should give the new org its own copy of the v1 presets
 * rather than leaving it empty.
 */
function getMigrationMarkerKey(organizationId: string): string {
	return `v2-terminal-presets-migrated-${organizationId}`;
}

/**
 * Copies the v1 main-process terminal presets into the v2TerminalPresets
 * collection on first run per organization. v1's `getTerminalPresets`
 * auto-initializes the default agent presets the first time it's called, so
 * a user with no prior v1 customization still gets a populated v2 bar — and
 * a user who customized v1 keeps their preset library when they cross over.
 *
 * Runs once per org via a localStorage marker so subsequent re-renders are
 * no-ops, and so a user who deletes a migrated preset doesn't see it
 * reappear on the next mount.
 *
 * Shared between V2PresetsBar and V2PresetsSection — whichever entry point
 * loads first migrates, the other is a no-op.
 */
export function useMigrateV1PresetsToV2() {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;
	const migratedOrgRef = useRef<string | null>(null);

	useEffect(() => {
		if (!organizationId) {
			console.log("[v2-preset-migration] skip: no organizationId");
			return;
		}
		if (migratedOrgRef.current === organizationId) {
			console.log("[v2-preset-migration] skip: already migrated this session");
			return;
		}

		const markerKey = getMigrationMarkerKey(organizationId);
		if (localStorage.getItem(markerKey) === "1") {
			console.log("[v2-preset-migration] skip: marker present", { markerKey });
			migratedOrgRef.current = organizationId;
			return;
		}

		// Reserve the org marker eagerly so concurrent mounts (V2PresetsBar +
		// V2PresetsSection) don't both run the migration.
		migratedOrgRef.current = organizationId;

		// Use the vanilla electronTrpcClient (ipcLink) directly. Calling
		// `electronTrpc.settings.getTerminalPresets.useQuery()` here would
		// route through whichever tRPC React provider is in scope — and
		// V2PresetsBar is mounted inside WorkspaceTrpcProvider, which would
		// send the request to the workspace HTTP server (no `settings` router
		// → 404). The vanilla client always uses Electron IPC.
		void (async () => {
			try {
				const v1Presets =
					await electronTrpcClient.settings.getTerminalPresets.query();
				console.log("[v2-preset-migration] fetched v1 presets", {
					count: v1Presets.length,
				});

				// Bulk insert so validation runs on all rows up front — a single
				// bad row rejects the whole batch rather than leaving partial
				// state that would collide on the next retry.
				const now = new Date();
				collections.v2TerminalPresets.insert(
					v1Presets.map((v1Preset, index) => ({
						id: v1Preset.id,
						name: v1Preset.name,
						description: v1Preset.description,
						cwd: v1Preset.cwd,
						commands: v1Preset.commands,
						projectIds: v1Preset.projectIds ?? null,
						pinnedToBar: v1Preset.pinnedToBar,
						applyOnWorkspaceCreated: v1Preset.applyOnWorkspaceCreated,
						applyOnNewTab: v1Preset.applyOnNewTab,
						executionMode: v1Preset.executionMode ?? "new-tab",
						tabOrder: index,
						createdAt: now,
					})),
				);

				localStorage.setItem(markerKey, "1");
				console.log("[v2-preset-migration] done", { markerKey });
			} catch (error) {
				// Roll back the in-memory marker so we retry on next mount.
				migratedOrgRef.current = null;
				console.error("[v2-preset-migration] failed", error);
			}
		})();
	}, [collections.v2TerminalPresets, organizationId]);
}
