import { HOST_AGENT_PRESETS } from "@superset/shared/host-agent-presets";
import { Skeleton } from "@superset/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	MemoryAgentList,
	type MemoryAgentRow,
} from "./components/MemoryAgentList";
import { MemoryEditor } from "./components/MemoryEditor";
import {
	entryGroupLabel,
	entryScope,
	MemoryFileList,
} from "./components/MemoryFileList";
import {
	AGENT_MEMORY_FILES_QUERY_KEY,
	AGENT_MEMORY_LIST_QUERY_KEY,
} from "./constants";
import { targetKey } from "./utils/targetKey";

const routeApi = getRouteApi("/_authenticated/_dashboard/memory/");

const PRESET_LABELS = new Map(
	HOST_AGENT_PRESETS.map((preset) => [preset.presetId, preset.label]),
);

export function MemoryView() {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const navigate = useNavigate();
	const { agent: agentFromRoute } = routeApi.useSearch();

	const listQuery = useQuery({
		queryKey: [...AGENT_MEMORY_LIST_QUERY_KEY, activeHostUrl] as const,
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) return [];
			return getHostServiceClientByUrl(activeHostUrl).agentMemory.list.query();
		},
		// Agents rewrite these files mid-session; refocusing the app is the
		// earliest moment fresh counts/mtimes can matter.
		staleTime: 15_000,
		refetchOnWindowFocus: "always",
	});
	const configsQuery = useV2AgentConfigs(activeHostUrl);

	const rows: MemoryAgentRow[] = (listQuery.data ?? []).map((entry) => {
		const config = configsQuery.data?.find(
			(candidate) => candidate.presetId === entry.presetId,
		);
		return {
			presetId: entry.presetId,
			fileCount: entry.fileCount,
			label:
				config?.label ?? PRESET_LABELS.get(entry.presetId) ?? entry.presetId,
			iconId: config?.iconId ?? null,
		};
	});

	const selectedPresetId = rows.some((row) => row.presetId === agentFromRoute)
		? (agentFromRoute as string)
		: (rows[0]?.presetId ?? null);
	const selected =
		rows.find((row) => row.presetId === selectedPresetId) ?? null;

	const filesQuery = useQuery({
		queryKey: [
			...AGENT_MEMORY_FILES_QUERY_KEY,
			activeHostUrl,
			selectedPresetId,
		] as const,
		enabled: !!activeHostUrl && !!selectedPresetId,
		queryFn: () => {
			if (!activeHostUrl || !selectedPresetId) return [];
			return getHostServiceClientByUrl(
				activeHostUrl,
			).agentMemory.listFiles.query({ agent: selectedPresetId });
		},
		staleTime: 15_000,
		refetchOnWindowFocus: "always",
	});

	const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset selection when the agent changes
	useEffect(() => {
		setSelectedFileKey(null);
	}, [selectedPresetId]);

	const fileEntries = filesQuery.data ?? [];
	const selectedEntry =
		fileEntries.find((entry) => targetKey(entry.target) === selectedFileKey) ??
		fileEntries[0] ??
		null;

	const unavailableMessage = getHostServiceUnavailableMessage(hostService, {
		action: "load agent memory",
	});

	return (
		<div className="flex h-full w-full flex-col">
			<header className="shrink-0 border-b px-6 pb-4">
				<h1 className="text-lg font-semibold">Memory</h1>
				<p className="mt-0.5 text-sm text-muted-foreground">
					What each agent remembers on this machine — global instructions,
					per-project and per-worktree instruction files, and auto-memory notes.
				</p>
			</header>
			{listQuery.isError || (!activeHostUrl && !listQuery.isLoading) ? (
				<div className="p-6 text-sm text-destructive">
					Couldn't load agent memory:{" "}
					{listQuery.error instanceof Error
						? listQuery.error.message
						: unavailableMessage}
				</div>
			) : listQuery.isLoading || !listQuery.data ? (
				<ListSkeleton />
			) : (
				<div className="flex min-h-0 flex-1">
					<MemoryAgentList
						rows={rows}
						selectedPresetId={selectedPresetId}
						onSelect={(presetId) =>
							void navigate({
								to: "/memory",
								search: { agent: presetId },
								replace: true,
							})
						}
					/>
					{filesQuery.isLoading ? (
						<FileListSkeleton />
					) : (
						<MemoryFileList
							entries={fileEntries}
							selectedKey={
								selectedEntry ? targetKey(selectedEntry.target) : null
							}
							onSelect={(entry) => setSelectedFileKey(targetKey(entry.target))}
						/>
					)}
					<div className="min-w-0 flex-1">
						{filesQuery.isError ? (
							<div className="p-6 text-sm text-destructive">
								Couldn't load files:{" "}
								{filesQuery.error instanceof Error
									? filesQuery.error.message
									: unavailableMessage}
							</div>
						) : selected && selectedEntry && activeHostUrl ? (
							<MemoryEditor
								key={`${activeHostUrl}:${selected.presetId}:${targetKey(selectedEntry.target)}`}
								hostUrl={activeHostUrl}
								presetId={selected.presetId}
								target={selectedEntry.target}
								label={`${selected.label} — ${entryGroupLabel(selectedEntry)}${
									entryScope(selectedEntry) === "global"
										? ""
										: ` (${entryScope(selectedEntry)})`
								}`}
							/>
						) : (
							<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
								No agents with known memory files.
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function ListSkeleton() {
	return (
		<div className="flex min-h-0 flex-1">
			<div className="w-64 shrink-0 space-y-2 border-r p-3">
				{[0, 1, 2, 3].map((i) => (
					<Skeleton key={i} className="h-9 w-full" />
				))}
			</div>
			<div className="flex-1 p-6">
				<Skeleton className="h-6 w-64" />
				<Skeleton className="mt-4 h-40 w-full" />
			</div>
		</div>
	);
}

function FileListSkeleton() {
	return (
		<div className="w-72 shrink-0 space-y-2 border-r p-3">
			{[0, 1, 2, 3, 4, 5].map((i) => (
				<Skeleton key={i} className="h-6 w-full" />
			))}
		</div>
	);
}
