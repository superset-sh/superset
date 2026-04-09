import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	DEFAULT_TERMINAL_PRESET_AGENT_TYPES,
} from "@superset/shared/agent-command";
import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

/**
 * Org-scoped marker key. The v2TerminalPresets collection is per-org
 * (`v2-terminal-presets-${organizationId}`) so the seed marker must be too,
 * otherwise switching orgs leaves the new org with an empty preset bar.
 */
function getSeedMarkerKey(organizationId: string): string {
	return `v2-terminal-presets-seeded-${organizationId}`;
}

// Legacy global marker from earlier builds. We remove it on first mount so
// returning users fall into the normal per-org seeding path instead of being
// permanently skipped by a stale flag.
const LEGACY_GLOBAL_SEED_MARKER_KEY = "v2-terminal-presets-seeded";

/**
 * Seeds default terminal presets into the v2TerminalPresets collection once
 * per organization. Uses an org-scoped localStorage marker so a user who
 * intentionally deletes a default preset does not see it reappear, but a user
 * who switches to a new org still gets the default set.
 *
 * Shared between V2PresetsBar and V2PresetsSection — whichever entry point
 * loads first seeds, the other is a no-op.
 */
export function useSeedDefaultV2Presets() {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;
	const seededOrgRef = useRef<string | null>(null);

	useEffect(() => {
		if (!organizationId) return;
		if (seededOrgRef.current === organizationId) return;

		const markerKey = getSeedMarkerKey(organizationId);

		// One-time migration for users coming from pre-fix builds: if the
		// legacy global marker is set and we don't yet have a per-org marker,
		// assume the currently-active org is the one that was already seeded
		// and carry the marker forward. This preserves the "don't re-seed
		// after intentional deletion" guarantee for the common case. Multi-org
		// legacy users would need to manually create presets in other orgs.
		if (
			localStorage.getItem(LEGACY_GLOBAL_SEED_MARKER_KEY) === "1" &&
			localStorage.getItem(markerKey) !== "1"
		) {
			localStorage.setItem(markerKey, "1");
			localStorage.removeItem(LEGACY_GLOBAL_SEED_MARKER_KEY);
			seededOrgRef.current = organizationId;
			return;
		}

		if (localStorage.getItem(markerKey) === "1") {
			seededOrgRef.current = organizationId;
			return;
		}

		for (const [
			index,
			agent,
		] of DEFAULT_TERMINAL_PRESET_AGENT_TYPES.entries()) {
			collections.v2TerminalPresets.insert({
				id: crypto.randomUUID(),
				name: agent,
				description: AGENT_PRESET_DESCRIPTIONS[agent],
				cwd: "",
				commands: AGENT_PRESET_COMMANDS[agent],
				projectIds: null,
				pinnedToBar: true,
				executionMode: "new-tab",
				tabOrder: index,
				createdAt: new Date(),
			});
		}

		localStorage.setItem(markerKey, "1");
		seededOrgRef.current = organizationId;
	}, [collections.v2TerminalPresets, organizationId]);
}
