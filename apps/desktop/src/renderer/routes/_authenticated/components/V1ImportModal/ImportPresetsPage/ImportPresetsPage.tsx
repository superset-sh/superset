import type { TerminalPreset } from "@superset/local-db";
import {
	AGENT_LABELS,
	AGENT_TYPES,
	type AgentType,
} from "@superset/shared/agent-command";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { LuTerminal } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { ImportPageShell } from "../components/ImportPageShell";
import { ImportRow, type RowAction } from "../components/ImportRow";

interface ImportPresetsPageProps {
	organizationId: string;
}

const BUILTIN_AGENT_IDS = new Set<string>(AGENT_TYPES);

export function ImportPresetsPage({ organizationId }: ImportPresetsPageProps) {
	const collections = useCollections();
	const presetsQuery = electronTrpc.settings.getTerminalPresets.useQuery();
	const [isRefreshing, setIsRefreshing] = useState(false);

	const { data: v2Presets = [] } = useLiveQuery(
		(query) => query.from({ v2TerminalPresets: collections.v2TerminalPresets }),
		[collections],
	);

	const importedAgentIds = useMemo(
		() => new Set(v2Presets.flatMap((p) => (p.agentId ? [p.agentId] : []))),
		[v2Presets],
	);
	const importedNames = useMemo(
		() => new Set(v2Presets.flatMap((p) => (p.agentId ? [] : [p.name]))),
		[v2Presets],
	);

	const isLoading = presetsQuery.isPending;
	const presets = presetsQuery.data ?? [];

	const refresh = async () => {
		setIsRefreshing(true);
		try {
			await presetsQuery.refetch();
		} finally {
			setIsRefreshing(false);
		}
	};

	return (
		<ImportPageShell
			title="Bring over your terminal presets"
			description="Import each v1 terminal preset into v2."
			isLoading={isLoading}
			itemCount={presets.length}
			emptyMessage="No v1 terminal presets found."
			onRefresh={refresh}
			isRefreshing={isRefreshing}
		>
			{presets.map((preset, index) => {
				const linkedAgentId = BUILTIN_AGENT_IDS.has(preset.name)
					? (preset.name as AgentType)
					: undefined;
				const v2Name = linkedAgentId
					? AGENT_LABELS[linkedAgentId]
					: preset.name;
				const alreadyImported = linkedAgentId
					? importedAgentIds.has(linkedAgentId)
					: importedNames.has(v2Name);
				return (
					<PresetRow
						key={preset.id}
						preset={preset}
						tabOrder={index}
						linkedAgentId={linkedAgentId}
						v2Name={v2Name}
						alreadyImported={alreadyImported}
						organizationId={organizationId}
					/>
				);
			})}
		</ImportPageShell>
	);
}

interface PresetRowProps {
	preset: TerminalPreset;
	tabOrder: number;
	linkedAgentId: AgentType | undefined;
	v2Name: string;
	alreadyImported: boolean;
	organizationId: string;
}

function PresetRow({
	preset,
	tabOrder,
	linkedAgentId,
	v2Name,
	alreadyImported,
	organizationId,
}: PresetRowProps) {
	const collections = useCollections();
	const [running, setRunning] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const runImport = async () => {
		setRunning(true);
		setErrorMessage(null);
		try {
			const row: V2TerminalPresetRow = {
				id: crypto.randomUUID(),
				name: v2Name,
				description: preset.description,
				cwd: preset.cwd,
				commands: preset.commands,
				projectIds: preset.projectIds ?? null,
				pinnedToBar: preset.pinnedToBar,
				applyOnWorkspaceCreated: preset.applyOnWorkspaceCreated,
				applyOnNewTab: preset.applyOnNewTab,
				executionMode: preset.executionMode ?? "new-tab",
				tabOrder,
				createdAt: new Date(),
				agentId: linkedAgentId,
			};
			collections.v2TerminalPresets.insert(row);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setErrorMessage(message);
			console.error("[v1-import] preset import failed", {
				v1PresetId: preset.id,
				organizationId,
				err,
			});
		} finally {
			setRunning(false);
		}
	};

	const action: RowAction = (() => {
		if (running) return { kind: "running" };
		if (alreadyImported) return { kind: "imported" };
		if (errorMessage) {
			return { kind: "error", message: errorMessage, onRetry: runImport };
		}
		return { kind: "ready", label: "Import", onClick: runImport };
	})();

	return (
		<ImportRow
			icon={<LuTerminal className="size-3.5" strokeWidth={2} />}
			primary={v2Name}
			secondary={preset.description ?? preset.commands[0]}
			action={action}
		/>
	);
}
