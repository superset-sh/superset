import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
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
	const { data: v1Presets } =
		electronTrpc.settings.getTerminalPresets.useQuery();
	const migratedOrgRef = useRef<string | null>(null);

	useEffect(() => {
		if (!organizationId) return;
		if (!v1Presets) return;
		if (migratedOrgRef.current === organizationId) return;

		const markerKey = getMigrationMarkerKey(organizationId);
		if (localStorage.getItem(markerKey) === "1") {
			migratedOrgRef.current = organizationId;
			return;
		}

		for (const [index, v1Preset] of v1Presets.entries()) {
			collections.v2TerminalPresets.insert({
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
				createdAt: new Date(),
			});
		}

		localStorage.setItem(markerKey, "1");
		migratedOrgRef.current = organizationId;
	}, [collections.v2TerminalPresets, organizationId, v1Presets]);
}
