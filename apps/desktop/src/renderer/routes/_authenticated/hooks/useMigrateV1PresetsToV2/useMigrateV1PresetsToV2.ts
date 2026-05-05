import {
	AGENT_LABELS,
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	AGENT_TYPES,
	type AgentType,
} from "@superset/shared/agent-command";
import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { MOCK_ORG_ID } from "shared/constants";

function getMigrationMarkerKey(organizationId: string): string {
	return `v2-terminal-presets-migrated-${organizationId}`;
}

/**
 * Copies v1 main-process terminal presets into the v2TerminalPresets
 * collection on first run per organization. v1's `getTerminalPresets`
 * auto-initializes default agent presets on first call, so fresh users
 * get a populated bar and users who customized v1 keep their presets.
 *
 * Uses the vanilla electronTrpcClient (ipcLink) instead of the React
 * hook because V2PresetsBar is mounted inside WorkspaceTrpcProvider,
 * which would route the request to the workspace HTTP server (404).
 */
export function useMigrateV1PresetsToV2() {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;
	const migratedOrgRef = useRef<string | null>(null);

	useEffect(() => {
		if (!organizationId) return;
		if (migratedOrgRef.current === organizationId) return;

		const markerKey = getMigrationMarkerKey(organizationId);
		if (localStorage.getItem(markerKey) === "1") {
			migratedOrgRef.current = organizationId;
			return;
		}

		migratedOrgRef.current = organizationId;

		void (async () => {
			try {
				const v1Presets =
					await electronTrpcClient.settings.getTerminalPresets.query();

				const now = new Date();
				// v1 default presets are named after the agent id (lowercase
				// "claude", "codex", …). Link those rows to the matching builtin
				// instead of dropping them in unlinked, so the v2 user gets one
				// row per builtin (not the v1 row + a separately-seeded v2 row).
				const builtinIds = new Set<string>(AGENT_TYPES);
				const linkedAgentIds = new Set<string>();
				const rows: V2TerminalPresetRow[] = v1Presets.map((v1Preset, index) => {
					const linkedAgentId = builtinIds.has(v1Preset.name)
						? (v1Preset.name as AgentType)
						: undefined;
					if (linkedAgentId) linkedAgentIds.add(linkedAgentId);
					return {
						id: crypto.randomUUID(),
						name: linkedAgentId ? AGENT_LABELS[linkedAgentId] : v1Preset.name,
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
						agentId: linkedAgentId,
					};
				});

				// Seed any remaining builtins that weren't already represented in
				// v1 — v1 only ships defaults for a subset of agents.
				let nextOrder = rows.length;
				for (const agentId of AGENT_TYPES) {
					if (linkedAgentIds.has(agentId)) continue;
					rows.push({
						id: crypto.randomUUID(),
						name: AGENT_LABELS[agentId],
						description: AGENT_PRESET_DESCRIPTIONS[agentId],
						cwd: "",
						commands: [AGENT_PRESET_COMMANDS[agentId][0] ?? ""],
						projectIds: null,
						executionMode: "new-tab",
						tabOrder: nextOrder++,
						createdAt: now,
						agentId,
					});
				}

				collections.v2TerminalPresets.insert(rows);

				localStorage.setItem(markerKey, "1");
			} catch {
				migratedOrgRef.current = null;
			}
		})();
	}, [collections.v2TerminalPresets, organizationId]);
}
