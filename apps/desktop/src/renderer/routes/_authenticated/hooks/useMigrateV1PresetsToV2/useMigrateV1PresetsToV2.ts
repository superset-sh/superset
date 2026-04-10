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
	const v1PresetsQuery = electronTrpc.settings.getTerminalPresets.useQuery();
	const v1Presets = v1PresetsQuery.data;
	const migratedOrgRef = useRef<string | null>(null);

	console.log("[v2-preset-migration] hook invoked", {
		organizationId,
		v1QueryStatus: v1PresetsQuery.status,
		v1QueryError: v1PresetsQuery.error,
		v1PresetCount: v1Presets?.length,
		alreadyMigratedThisSession: migratedOrgRef.current === organizationId,
	});

	useEffect(() => {
		console.log("[v2-preset-migration] effect run", {
			organizationId,
			hasV1Presets: !!v1Presets,
			v1PresetCount: v1Presets?.length,
		});

		if (!organizationId) {
			console.log("[v2-preset-migration] skip: no organizationId");
			return;
		}
		if (!v1Presets) {
			console.log("[v2-preset-migration] skip: v1 presets not loaded yet");
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

		console.log("[v2-preset-migration] migrating", {
			count: v1Presets.length,
			markerKey,
		});

		for (const [index, v1Preset] of v1Presets.entries()) {
			console.log("[v2-preset-migration] inserting", {
				index,
				id: v1Preset.id,
				name: v1Preset.name,
			});
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
		console.log("[v2-preset-migration] done");
	}, [collections.v2TerminalPresets, organizationId, v1Presets]);
}
