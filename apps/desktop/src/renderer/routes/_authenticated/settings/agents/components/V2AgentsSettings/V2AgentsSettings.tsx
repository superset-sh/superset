import type {
	AgentPreset,
	HostAgentConfigDto,
} from "@superset/host-service/settings";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { AgentDetail } from "./components/AgentDetail";
import { AgentsSettingsSidebar } from "./components/AgentsSettingsSidebar";

const QUERY_KEY = ["host-agent-configs"] as const;

export function V2AgentsSettings() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();

	const configsQuery = useQuery({
		queryKey: [...QUERY_KEY, activeHostUrl] as const,
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) return [] as HostAgentConfigDto[];
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.list.query();
		},
	});

	const presetsQuery = useQuery({
		queryKey: [...QUERY_KEY, "presets", activeHostUrl] as const,
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) return [] as AgentPreset[];
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.listPresets.query();
		},
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, activeHostUrl] });

	const addMutation = useMutation({
		mutationFn: (presetId: string) => {
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.add.mutate({ presetId });
		},
		onSuccess: (added) => {
			invalidate();
			if (added?.id) setSelectedAgentId(added.id);
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to add agent"),
	});

	const reorderMutation = useMutation({
		mutationFn: (ids: string[]) => {
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.reorder.mutate({ ids });
		},
		onMutate: async (ids) => {
			await queryClient.cancelQueries({
				queryKey: [...QUERY_KEY, activeHostUrl],
			});
			const previous = queryClient.getQueryData<HostAgentConfigDto[]>([
				...QUERY_KEY,
				activeHostUrl,
			]);
			if (previous) {
				const byId = new Map(previous.map((row) => [row.id, row]));
				const next = ids
					.map((id, index) => {
						const row = byId.get(id);
						return row ? { ...row, order: index } : null;
					})
					.filter((row): row is HostAgentConfigDto => row !== null);
				queryClient.setQueryData([...QUERY_KEY, activeHostUrl], next);
			}
			return { previous };
		},
		onError: (err, _ids, ctx) => {
			if (ctx?.previous) {
				queryClient.setQueryData([...QUERY_KEY, activeHostUrl], ctx.previous);
			}
			toast.error(err instanceof Error ? err.message : "Failed to reorder");
		},
		onSettled: () => invalidate(),
	});

	const resetMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.resetToDefaults.mutate();
		},
		onSuccess: () => {
			setSelectedAgentId(null);
			invalidate();
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to reset"),
	});

	const configs = configsQuery.data ?? [];
	const presets = presetsQuery.data ?? [];
	const descriptionByPresetId = useMemo(
		() =>
			new Map(presets.map((preset) => [preset.presetId, preset.description])),
		[presets],
	);

	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

	// Auto-select first agent when none selected, and clear selection when the
	// selected agent disappears.
	useEffect(() => {
		if (configs.length === 0) {
			if (selectedAgentId !== null) setSelectedAgentId(null);
			return;
		}
		const stillExists = configs.some((c) => c.id === selectedAgentId);
		if (!stillExists) setSelectedAgentId(configs[0].id);
	}, [configs, selectedAgentId]);

	const selectedAgent = configs.find((c) => c.id === selectedAgentId) ?? null;

	if (configsQuery.isError) {
		return (
			<div className="p-6 text-sm text-destructive">
				Couldn't load agent settings:{" "}
				{configsQuery.error instanceof Error
					? configsQuery.error.message
					: "host service unavailable"}
			</div>
		);
	}

	return (
		<div className="flex h-full w-full">
			{configsQuery.isLoading ? (
				<SidebarSkeleton />
			) : (
				<AgentsSettingsSidebar
					configs={configs}
					presets={presets}
					selectedAgentId={selectedAgentId}
					onSelectAgent={setSelectedAgentId}
					onAddAgent={(presetId) => addMutation.mutate(presetId)}
					onReorder={(ids) => reorderMutation.mutate(ids)}
					onResetToDefaults={() => resetMutation.mutate()}
					isAdding={addMutation.isPending}
					isResetting={resetMutation.isPending}
				/>
			)}
			<div className="flex-1 overflow-y-auto">
				{selectedAgent ? (
					<AgentDetail
						key={selectedAgent.id}
						config={selectedAgent}
						description={
							descriptionByPresetId.get(selectedAgent.presetId) ??
							"Terminal agent launch configuration"
						}
						onChanged={invalidate}
						onDeleted={() => {
							setSelectedAgentId(null);
							invalidate();
						}}
					/>
				) : (
					<EmptyState />
				)}
			</div>
		</div>
	);
}

function SidebarSkeleton() {
	return (
		<div className="w-64 shrink-0 border-r p-3 space-y-3">
			<Skeleton className="h-8 w-full" />
			{[0, 1, 2, 3].map((i) => (
				<Skeleton key={i} className="h-7 w-full" />
			))}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<div className="text-center">
				<Bot
					aria-hidden="true"
					className="mx-auto size-10 text-muted-foreground/60"
				/>
				<h3 className="mt-3 text-sm font-medium">No agents yet</h3>
				<p className="mt-1 text-xs text-muted-foreground">
					Add one from the menu in the sidebar to get started.
				</p>
			</div>
		</div>
	);
}
